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
    => DRAFTED 2026-10-01, overnight, by manifest-9f (a session for documents only, delegated by manifest-app-3a; the
    planning session had ended), in plans/2026-10-01-fe46-fe47-fe5-spec-actions.md. NOT APPLIED: each waits for Rich to
    read its words and decide, and he also decides where they go in the plan order (recommended: a small plan of their own,
    after the launch path and before faculty-ready). The choices the draft puts to him:
      - FE-46: may the Manifest team hand a send back, and must every gap be answered (both recommended yes);
      - FE-47: (a) `sent` with `sent_from: active` (recommended), or (a′) a `change_sent` state.

# Rich's decisions — 2026-10-02, late evening (session manifest-96, opening the faculty-ready plan's sitting 1)

    FE-51 AND FE-52 INTO FACULTY-READY — "add them to the faculty-ready plan" (Rich, to manifest-96, after it relayed the
    faculty front-end's F6b sitting 1 measurements on 7100 and confirmed both in the code). FE-51: TOKEN_ACTION_PENDING's
    hint says "same Idempotency-Key", but a confirmation matches the token, method, path and body. FE-52: a revoked
    token's questions stay pending, and a confirm of one is 200 and can never be spent. => Tasks 12 and 13 (sittings 2
    and 4); their designs are the plan's Decisions 16 and 17 (71ce7f0).

    Asked at the sitting's open, as ORIENTATION §7e says, through the question tool; his three answers:
      - WHERE FE-46, FE-47 AND FE-5 GO — "After faculty-ready" (option (b) of the draft's Placement; the draft
        recommended (a), a small plan of their own before it). His 2026-09-30 order stands: faculty-ready, then these,
        then FE-32. Their spec actions stay DRAFTED, not applied (plans/2026-10-01-fe46-fe47-fe5-spec-actions.md); the
        front-end's F5b sends and F6b moment 17 build against the mock meanwhile.
      - THE EXECUTION METHOD — "Inline (Recommended)": superpowers:executing-plans, commit per task on main.
      - F7, FE-49 AND FE-50 — "All into faculty-ready": FE-50 (the remedy and authentication.md:50 say the minter
        confirms; the confirm route asks anyone holding the capability — the words follow the code) joins Task 12, the
        same remedy text FE-51 rewrites; FE-49 (`Token` gains `mintedBy`) joins Task 13; F7 (driver 1 answers
        SOURCE_REPOSITORY_EXISTS, as driver 2 does, rather than a false SOURCE_CONFLICT) becomes Task 14, in sitting 2.

# Rich's decisions — 2026-10-03, just after midnight (session manifest-71, opening the faculty-ready plan's sitting 2)

    Asked at the sitting's open, as ORIENTATION §7e says, through the question tool, each with the proposed words shown
    as the option's preview; his two answers:
      - SPEC ACTION 2 (§25, `listed`) — "(a) Apply as worded (Recommended)". The fixture blueprint declares
        `listed: false`; listBlueprints omits it and it still resolves. Option (b), a setting that stops the fixture
        loading, was already rejected on 2026-09-30. => APPLIED the same hour: §25's descriptor example gains the
        `listed: true` line after `major_version`, and the sentence follows the example. Task 2 builds it.
      - SPEC ACTION 3 (§20, the request id and a limit's facts) — "(a) Apply as worded (Recommended)", over (b) the id
        only on 5xx. => APPLIED the same hour, the words unchanged, as their OWN paragraph straight after the one
        ending "…extended to clients that are programs. This improves the console too; …": placed inside that
        paragraph, its "This improves the console too" would have referred to the new words rather than to the code and
        hint. Tasks 3 and 4 build it; the contract goes to 1.6.0 at Task 3.
    Shared pages checked for both: manifest-decisions.html's D23 says nothing of what an error carries, and no page names
    the fixture blueprint — none changes.

    And, asked in the same sitting while the faculty front-end holds 7100 for its F6b sitting 6 (manifest-app-a1, ~6–8 h, at
    Rich's "co-ordinate and start when possible"), through the question tool:
      - THE ORDER — front-end F6b sitting 6 first; platform sitting 2 waits for its "7100 released" (sent after its gates);
        then the front-end adopts 1.6.0; then F5b SITTING 1 — "After platform sitting 2 (Recommended)", on a fresh 7100
        and contract 1.6.0, over running it in the same pre-truncation window (+3–5 h to the hold, on 1.5.0).
      - f6b-measure-1 — "Simply truncate (Recommended)": sitting 2's first Vitest run takes its rows; the cleanup scripts take
        its containers, networks and volumes at the close; its real repository becomes a third that no project owns, beside
        f6-watch and keep-walk-1002 (removing them is Rich's). Not archived first; deleting it is refused anyway (launched).
      - WHAT THE PLATFORM DOES DURING THE HOLD — "Decide Spec action 4 now", "Decide Spec action 1 now", "Draft Tasks 2 & 14's
        tests" (control-plane src/ only, not run until the release; nothing in packages/contract or packages/mock).
      - SPEC ACTION 4 (§12, an init) — "(a) App containers (Recommended)", over (b) every container. => APPLIED: a bullet after
        the resource-ceilings item. Task 8 builds it.
      - SPEC ACTION 1 (§26 and §6, the administrator's reason) — "(a) As drafted + quota (Recommended)". The premise check found
        the drafted words named only two of the three exempt duties his 2026-09-30 design lists (release:approve,
        launch:record, quota:set — Task 10's ADMIN_DUTIES); "and setting a project's quota" is added to the duties, every
        other word as drafted. Over (a′) verbatim, (b) no exemptions, (c) a body field. => APPLIED: §26's Non-repudiation
        paragraph replaced; §6's Event row gains actor_user_id, acted_as_admin and reason. Task 10 builds it.
    Shared pages checked for 1 and 4: D31 is about the admin dashboard's interface, not audit; no page mentions audit, a
    reason or an init — none changes. Every spec action of the faculty-ready plan is now applied.

# Rich's decisions — 2026-10-03, ~01:10 PDT (session manifest-3d, the night-shift coordinator)

    Rich, going to bed, asked manifest-3d to organise overnight work on the platform and the faculty front-end ("at least 3
    sittings of each"), spawning and co-ordinating agents, and to write a report for the morning. Asked through the
    question tool, each with its options and a recommendation:
      - THE NIGHT PLAN — "Approve as written (Recommended)": platform faculty-ready sittings 2 → 3 → 4, one at a time; if time
        remains, sitting 6 (Task 10, §26's reason) is pulled AHEAD of sitting 5 — a re-cut of the sittings table's order only,
        no task moves between sittings. The front-end, in mock mode beside them: F6b sitting 6 finished, a minors sitting, the
        contract 1.6.0 adoption once sitting 2 lands, and the __Host- cookie adoption once sitting 3 lands. F5b sitting 1
        (7100, passwords, an admin grant, a real repository) is NOT overnight.
      - THE MINORS — "Its pick, no decisions (Recommended)": any open minor in manifest-app's docs/minors.md that needs no
        decision of Rich's and no 7100; the sitting lists what it skipped and why.
      - PLATFORM SITTING 5 — "Yes, pre-authorise": his yes to Task 7's `make seed` with the network on (node:24-alpine pulled
        and mirrored), and he adds SSP_STORE_PASSWORD to .env himself before bed (Task 9's Step 2, printed, never written by
        an agent). Sitting 5 runs overnight only if sittings 2–4 close first.
      - F6b SITTING 6's CLICK — "Tonight if ready, else morning (Recommended)": manifest-app-a1 staged it within minutes, so
        he clicks before bed; 7100 is released to platform sitting 2 after it.
      - PASSWORDS ON manifest.internal — said as he left for bed, ~01:35 PDT, in his own words: "I give permission to type
        passwords here on manifest.internal - it's completely local. If you can run chrome headlessly, feel free to do so,
        you can enter usernames and passwords here, no harm will be done. This is also true for any agents you spawn."
        A STANDING yes for the laptop IdP's test users, typed by an agent or a headless Chrome it drives (the front-end's
        scripts/walk/ already does this "only at Rich's yes"). It does not cover a real UBC credential, `sudo`, or a
        clicked half's purpose (a PERSON seeing it work), and a classifier refusal is still not worked around.
      - MORE WORK IF THE QUEUE EMPTIES — his words, the same minute: "If you finish early, I also give you permission to spawn
        more fresh agents in the platform or app to be able to get more work done. The latest you may START an agent with its
        work is 8am Vancouver, BC time." No agent is started after 08:00 PDT, 2026-10-03.
      - MINOR SPEC EDITS OVERNIGHT — his words, ~01:40 PDT: "if you determine the spec edits are minor, and you are confident
        they will improve the app or platform (or if they're just the right thing to do) then I also give you permission to
        make those spec edits, too whilst I am asleep." HOW manifest-3d applies it: a sitting that needs a spec edit drafts
        it as a Spec action (exact words, the section, why) and sends it to manifest-3d; manifest-3d judges it minor and
        confidently right, or holds it for Rich. An applied one is recorded in the roadmap's *Spec actions raised by…* as
        "APPLIED under Rich's night-shift permission (2026-10-03), judged minor by manifest-3d — for his review", its shared
        HTML pages swept, its commit alone; the morning report lists every one, so each is easy to revert. Anything that
        changes a decision of his, a security property, or a section's meaning is NOT minor and waits for him. A classifier
        refusal of a spec read or edit is still never worked around.

# Rich's decisions — 2026-10-03, ~12:45 PDT (session manifest-94, the morning after the night shift)

    Rich ran the night's three through-the-edge scripts (s3-, s4-, s6-edge-proof.sh) and the cleanup, and asked
    manifest-94 to check them and to lay out the next steps. manifest-94 put four decisions to him, each with its
    options and a recommendation, at code level. His words, answering all four: "I agree with all of your
    recommendations for all of the above. Please proceed to document those." So, each as recommended:

      1. §26'S REASON FOR AN ADMINISTRATOR WHO IS A COLLABORATOR (the faculty-ready plan's sitting 6's review, I2) —
         (a): a member is asked no reason only for what their own project role allows. Beyond it (deleting, archiving or
         restoring, managing people, promoting, as a collaborator) they act as an administrator and give one.
         => The faculty-ready plan's Spec action 5 APPLIED as worded (§26, Non-repudiation). No shared page mentions audit
         or a reason (checked by sitting 6), so none changes. The code is the plan's new Task 15, in sitting 5: one
         condition in projects/authz.ts's requireAdminReason, refusing also when
         !capabilitiesFor(projectRole, 'member').has(capability), and a test row each way. Rejected: (b) §26 as worded.

      2. SITTING 4'S M1 — A REVOKE'S QUESTIONS-ENDED EVENTS CAN BE LOST AFTER ITS COMMIT — (a): fixed in sitting 5, as
         the plan's new Task 16. publishQuestionsEnded runs after the transaction that revoked the token and expired its
         questions; if it throws, the 500's retry finds nothing pending and the pending_action.expired rows are never
         written. The fix: record the event rows inside the same transaction (recordEvent on the transaction) and push
         them on the bus after the commit — at all three callers (api/routes/tokens.ts, project-reads.ts' member removal,
         releases/lifecycle.ts' archive). Rejected: (b) sitting 7's fix wave (the acceptance should change no code);
         (c) recorded and left.

      3. FE-46, FE-47 AND FE-5'S SPEC ACTIONS (plans/2026-10-01-fe46-fe47-fe5-spec-actions.md) — their WORDS APPROVED as
         drafted, with the recommended choices inside them:
           - FE-46 (i): the Manifest team (LTIC) MAY hand a send back unsubmitted, to the state it was sent from
             (sent_from);
           - FE-46 (ii): EVERY gap in the assessment must be answered before it is sent; "does not apply" is an answer;
           - FE-47: (a) active → sent, with sent_from: active (Spec action 10's pattern), over (a′) a change_sent state;
           - FE-5: (a) as worded (§6's PendingAction.payload, D24).
         Their placement stands (2026-10-02: after faculty-ready, before FE-32). APPROVED, NOT YET APPLIED at this entry:
         applying them, with the four shared HTML pages swept, is the next step's.
         => ALL THREE APPLIED the same day, ~13:05 PDT, by manifest-94: §6's two rows composed, §9, §13, §21, §26, §27
            and D24; manifest-decisions.html (D19, D24) and manifest-phases.html (stage 2) swept, the rest checked.

      4. THE SMALL ONES, each as recommended:
           - Decision 7 (cookie names by scheme: __Host- on https, plain on loopback http) — KEPT, though [M1] measured
             that Chrome and curl keep a __Host- cookie on loopback http. Firefox and Safari were not measured; the mock
             stays untouched.
           - The front-end's open question 9 — a plain manifest_session beside __Host-manifest_session is IGNORED, not
             "two are none" (confirmed as the front-end decided it).
           - The front-end's open question 10 — YES: the faculty front-end tells an owner, in what happened, that a
             platform administrator acted on their app, and the reason they gave (EventFrame.actor). Faculty never see the
             platform's raw stream, so this is how §26's "shown to the project's people" reaches them.
           - The front-end's open question 11 — CONFIRMED: a faculty member is shown the front-end's own support
             reference, never the platform's request id (which that reference's row records).
           - m129 — the words: "<Name>'s agent '<name>'" where the agent is not the reader's own; "Your agent '<name>'"
             stays for the reader's own.
           - m130 — YES, ask the platform: the asking token's expiresAt on pending_action.created (to be filed by the
             front-end as FE-53; additive, placed with FE-5, which changes the same file, tokens/pending.ts). It also
             gives m131 its fix: the front-end reads the platform's expiry rather than a member's word.
           - m17, m83, m110 and m66 — the night's routine calls ACCEPTED as made.
         The front-end's own documents (minors.md, its adoption note, api-findings.md) record them in its next session;
         this platform session does not edit ~/Developer/manifest-app.

    And at ~13:12 PDT, the front-end's Q10 words (manifest-app-5a's draft, put to him by manifest-94 through the question
    tool), for an act the platform marks EventFrame.actor.asAdministrator, in an app's history and "Since you were last
    here":
      - NAME THEM — "Name them (Recommended)": "Operator One, a Manifest administrator, switched it off, and said:
        ‘<reason>’". Over: no name.
      - THE VERB for an act with no line of its own — "worked on it" (his pick over the recommended "stepped in", and
        "made a change to it"): "Operator One, a Manifest administrator, worked on it, and said: ‘<reason>’".
      - THE OWNERS' EMAILS TOO — "Yes, same words (Recommended)" (manifest-94's recommendation, over the front-end's "leave
        them"): where an email says "Someone" for an administrator's act, it names them and carries the reason.
      - THE REST — "Approve as drafted (Recommended)": one line per act (the same administrator and reason within an hour
        fold into one), the reason as typed, in ‘ ’.

    And at ~13:27 PDT, the four questions of the FE-46/47/5 plan (docs/superpowers/plans/2026-10-03-fe46-fe47-fe5.md,
    863ad0e, written by manifest-c7; put to him by manifest-94 through the question tool, each premise checked against
    the code first):
      - SITTINGS — "Five" (the plan's offered alternative, over the recommended six): Task 8, the clients, folded into
        sittings 3 and 4.
      - DECISION 5, an owner's send over a change request an administrator FILED with UBC — "Only if UBC asked
        (Recommended)": from change_requested only when change_requested_from = 'submitted'; a filed one is UBC's to
        answer (409 LAUNCH_TRANSITION_INVALID). Over: allow it, as SUBMIT_ARROWS does today.
      - DECISION 4, the administrator's direct draft → submitted record — "Keep it (Recommended)": how a submission made
        outside Manifest is recorded, and what demo-production and demo-releases use. Over: remove it.
      - DECISION 10, the mailer — "nodemailer" (over the recommended hand-written plain-SMTP client on node:net): his yes
        to ONE networked pnpm add of nodemailer, pinned exactly, at the sitting that builds the mailer (with
        @types/nodemailer as a devDependency if the plan needs it). STARTTLS and AUTH for UBC's relay come with it.
    The plan is being revised to these; Rich has not yet approved it as a whole.

    And at ~13:34 PDT: manifest-b9 (sitting 5) found, after Task 16, that member.removed is published after the removal's
    commit and is never recorded by the retry (api/routes/project-reads.ts:657); its claim that project.archived shares the
    defect was checked by manifest-94 and is wrong (publishArchivedOnce, releases/lifecycle.ts:338, publishes it from the
    retry or the boot). Put to Rich, with "track it for later" recommended — "Fix it in sitting 5 now": the faculty-ready
    plan's Task 16b, after Task 9, its design manifest-b9's (the sentence counts sessions ended after the commit).

    And at ~13:37 PDT, on the revised FE-46/47/5 plan (2a72a13, five sittings, nodemailer), through the question tool:
      - THE PLAN — "Approve as revised (Recommended)". It runs after faculty-ready's sitting 7.
      - THE ADD — "Yes, as described (Recommended)": one networked `pnpm --filter @manifest/control-plane add --save-exact
        nodemailer`, tried --offline first; @types/nodemailer (-D, exact) only if nodemailer ships no .d.ts; allowBuilds
        settled if pnpm ignores a build script; the version, the day and the reason recorded. Sitting 2 need not ask again.
      - THE MEASUREMENT — "Task 3, after the add (Recommended)": nodemailer against Mailpit is Task 3's [M3b], straight after
        the add; no second networked command. Over: a scratch install in sitting 1.

    And at ~13:43–13:46 PDT, asked "Any decisions I can help with?", eight more, through the question tool, each premise
    checked against the code or the record first:
      - FE-32'S ALLOWLIST — "Yes, in this plan (Recommended)": FE-32's plan builds §12's package allowlist in its smallest
        faithful form (administrator-managed direct dependencies, seeded from the listed blueprints' skeletons; the resolve
        operation AND the build's lockfile gate refuse an unlisted one, 409 DEPENDENCY_NOT_ALLOWED); its spec action
        drafted in the plan, not applied. Over: its own plan straight after; no allowlist for now. (Premise: §12 promises
        it for v1; infra/verdaccio/config.yaml proxies every package; build/gates.ts checks only a lockfile and secrets.)
      - F5b SITTING 1 (the front-end, on 7100) — "After sitting 7, pre-authorised (Recommended)": once faculty-ready's
        sitting 7 closes; his yes covers a new private repository in Manifest-local-dev for the walk (his to delete after),
        a platform session re-granting operator's admin, and the test sign-ins. His click on app. still comes at its end.
      - §8's APK MIRROR — "Close it: no mirror (Recommended)": its premise is false since sitting 5 measured node:24-alpine
        at 0 Critical / 9 High (it clears the libcrypto3/libssl3 set). Revisit if a Critical lands that no newer base clears.
      - FE-44, a large course or public app can never launch (its load rehearsal blocks and is not built) — "Build the
        load rehearsal first" (over the recommended "keep it blocking, say so early", and "don't block until it's built"):
        §24's load rehearsal, BEFORE faculty use it for real, as a plan of its own PLACED BEFORE FE-32. The order is now:
        faculty-ready → FE-46/47/5 → the load rehearsal → FE-32 (with the allowlist) → the vulnerability database.
      - FE-45, an app that has been live put away — "A 'removed' state, after vuln DB (Recommended)": archived → removed
        (the owner's, person-only), only an administrator lists, restores or deletes it for good once retention allows;
        placed after the vulnerability database. Over: a removedAt filter; the same shape sooner.
      - m120 (the front-end's) — "Yes, any member (Recommended)": the sign-off ask shown to any member after launch, as the
        platform allows (COLLABORATOR holds approval:request).
      - THE FRONT-END'S WORDS BACKLOG — "Approve, change on sight (Recommended)": every word its sittings marked ours and
        listed for his review to date is approved; he changes any when he clicks through. Not covered: the minors needing
        his words or choice (m104, m107–m119, m123, m69/m76), which come back batched with recommendations.
      - A RE-SUBMISSION AND UBC'S ORDER — "Keep it uniform (Recommended)": a registration sent again (after a lapse or a
        change request) waits for the assessment approved and staging active, as a first one does, until UBC says
        otherwise.

    And at ~13:52 PDT, three shape questions of the load-rehearsal plan (manifest-c7, writing it; premises checked by
    manifest-94: none of §24's production table is built, nothing outside launch/readiness.ts reads the audience, so
    production runs one instance; the item sits in both readiness clauses), through the question tool:
      - WHAT THE REHEARSAL TESTS — "Build §24's capacity first" (over the recommended "rehearse what production actually
        runs" and "rehearse 3 instances anyway"): production capacity by audience is BUILT before the rehearsal measures it
        — instances per §24's table (class ≥2, large_course ≥3 with headroom, public ≥3), the edge balancing across them,
        hibernation per the table — and the rehearsal grants staging that shape. The rest of §24's table (backups,
        saturation alerting, tuned rate limits, public's security review) was not asked for. One plan or a split is
        manifest-c7's to propose and his to place.
      - THE LOAD PROFILE AND PASS MARK — "As proposed (Recommended)": 500 virtual users for large_course (public the same on
        a laptop, capped); synchronised = all within 60 s then 5 min sustained; steady = a 5-min ramp; passes at ≥99%
        answered (non-5xx, no timeout), p95 under 2 s, instances healthy; the health path, the root and the sign-in
        redirect. A spec action carries the numbers.
      - WHEN IT RE-RUNS — "First launch + audience raised (Recommended)": at the first launch, and again when the audience
        is raised to large_course or public after launch; not on every release.

    And at ~13:56 PDT, four more on §24's capacity and the load rehearsal (manifest-c7's proposals; premises checked by
    manifest-94: IDLE_POLICY in runtime/state-machine.ts is applied by nothing, so nothing hibernates and production's
    policy is none; Driver.servingInstance answers one instance; the blueprint's sessions live in Mongo, connect-mongo
    6.0.0), through the question tool:
      - THE SPLIT — "Two plans: A then B (Recommended)": Plan A, production capacity by audience (§24: solo 1, class 2,
        large_course 3, public 3 instances behind one load-balanced edge route; redeploys across N; a dead instance routed
        around; its own acceptance); Plan B, the load rehearsal, granting staging that shape. Order: FE-46/47/5 → A → B →
        FE-32 → the vulnerability database → FE-45. Over: one plan.
      - HIBERNATION — "Build hibernation in Plan A" (over the recommended "instances only"): §11's wake-on-request at the
        edge and §24's rows (solo hibernates; class not during term; large_course and public never), with a source of term
        dates the platform does not yet have.
      - THE LOAD GENERATOR — "vegeta" (over the recommended platform-owned Node script): pinned by digest and mirrored by
        make seed; its network pull is his yes at that sitting. A run the generator could not drive fails, never passes.
      - THE EDGE'S RATE LIMIT DURING A REHEARSAL — "Exempt the generator's IP (Recommended)": for one run, the staging route
        skips its per-IP limit for the generator's own address alone; every other client keeps 600/min.

    And at ~13:58 PDT, three on Plan A (manifest-c7's proposals), through the question tool, each as recommended:
      - "A1 → B → A2": Plan A splits into A1 (production instances by audience, `make demo-capacity`) and A2 (hibernation
        and wake-on-request, `make demo-hibernate`); the order is FE-46/47/5 → A1 → B (the load rehearsal) → A2 → FE-32 →
        the vulnerability database → FE-45. Over: A1 → A2 → B; one Plan A.
      - TERM DATES — "An admin platform setting": administrator-managed, set as deployment configuration (e.g.
        MANIFEST_TERMS), kept current yearly from UBC's published calendar; none set means a class app never hibernates.
        A spec action (§24, §26). Over: each project declaring its dates; UBC's Academic API (a later source).
      - PRE-WARM — "Record it as not built": named not built with its reason (only solo apps and class apps between terms
        can be cold at a burst); re-asked with the number if A2's measured cold wake is more than a few seconds.

    A CORRECTION, at 14:03 PDT, by manifest-94: the times of this afternoon's entries above were first written as
    manifest-94's estimates, which ran up to an hour and a half ahead of the clock (~13:40 to ~15:25 where the answers
    came at ~13:27 to ~13:58). They are now corrected from the commits that recorded each answer (cb05240 13:28, 069cfb3
    13:35, 7ac03f8 13:38, e93b814 13:47, 9bbd054 13:53, 5e62fe0 13:57, 1bc2568 13:59). Commit e93b814's subject still says
    "~14:25"; the entry is right. The plans and the front-end that copied the estimates are told to correct theirs.

    And at ~14:09 PDT (the clock read 14:10 at this entry), three on what follows, through the question tool:
      - THE FOUR NEW PLANS (FE-32 with the allowlist; A1, production instances; B, the load rehearsal; A2, hibernation;
        f6b3d83 and e969f9d, by manifest-c7) — "Fresh reviewer first (Recommended)": a read-only background reviewer of
        manifest-94's checks each against the code before they come to him for approval. Over: reading them himself;
        approving all four now.
      - FACULTY-READY SITTING 7 (the acceptance) — "A fresh session you spawn (Recommended)": Rich spawns a fresh session
        once manifest-b9 closes sitting 5; it starts from ORIENTATION §7e. Over: manifest-c7; manifest-b9 carrying on.
      - MANIFEST-C7 — "Stop there (Recommended)": after its roadmap update, no further plans for now (five are queued).

    And passport-ubcshib (Rich's library: npm maintainer `richtape`, github.com/ubc/passport-ubcshib). At ~13:5x he asked
    for a real fix rather than an advisory to the six UBC apps' owners; a background agent of manifest-94's built it on
    a local branch (fix/node-saml-5: @node-saml/passport-saml 5.1.1 replacing the deprecated passport-saml 3.2.4 and
    GHSA-4mxg-3p6v-xgq3, the public API kept, the MACE PUID and uid/eduPersonPrincipalName OID bugs fixed; 34 tests,
    npm audit 6 → 0; a real login against the local docker-simple-saml identical on 0.1.6 and the branch). At his word
    ("can you get this to github somewhere? And then I can ask our devs to test this"), manifest-94 pushed the branch
    and opened DRAFT PR https://github.com/ubc/passport-ubcshib/pull/1 at 14:20 PDT. Then, at ~14:24, asked to put it
    in Manifest's blueprint ("We can then test it locally at least"), through the question tool:
      - THE SOURCE — "npm prerelease 0.1.7-rc.1 (Recommended)": the branch bumped to 0.1.7-rc.1 (5f90fd6, 14:26) and
        published by Rich under the dist-tag `next` (latest stays 0.1.6; no ^0.1.x range resolves a prerelease); Manifest
        pins it and make seed mirrors it (his yes to that pull). Over: Verdaccio-only; a vendored tarball.
      - WHO — "b9, as sitting 5b (Recommended)": the faculty-ready plan's new Task 17, after sitting 5's close and before
        sitting 7, with the Docker tier and a real CWL sign-in through a Manifest-built app.

    And at 14:30 PDT Rich PUBLISHED passport-ubcshib 0.1.7-rc.1 to npm under the dist-tag `next` (latest stays 0.1.6);
    manifest-94 checked it: gitHead 5f90fd6, 7 files, its index.js and lib/attributes.js identical to the branch tested.

    And at ~14:33 PDT, on the fresh review of the four plans (docs/superpowers/plans/2026-10-03-review-of-four-plans.md;
    verdicts: FE-32 and A1 approve with fixes, B and A2 need rework), through the question tool:
      - WHO REVISES — in his words: "I think all of our agents are running long on their conversation length (context
        lengths). So I think we're best off starting fresh ones once each has finished their current task. Let me know when
        you want me to start a fresh session and in which part (platform or app) and I will do that." So a FRESH platform
        session revises the four plans to the review; and from now on each finishing agent hands over to a fresh session
        Rich starts at manifest-94's ask.
      - A1, A DEAD MEMBER OF A PRODUCTION SET — "Replace it automatically" (over the recommended "Report it", and "record
        as not built"): the platform starts a replacement; the plan designs who notices, a backoff and a cap for a
        crash-looping app, and the event.
      - A2, CLASS APPS AT TERM START — "Wake them at term start (Recommended)": asleep class production apps are woken when
        MANIFEST_TERMS says a term begins.
      - B, VEGETA — "Build it locally (Recommended)": an image built from the mirrored alpine plus vegeta's official
        release binary, checksum-verified; its download a Rich-step at that sitting.

    And at 14:42 PDT (the clock read 14:43 at this entry), the faculty front-end's minors that needed his choice or words,
    read by manifest-94 from manifest-app's docs/minors.md, through the question tool:
      - m69 + m76, the "we need you" email to someone whose own switch-off, delete or removal stopped their build — "A
        different email" (over the recommended "no email", and "leave as is"): it says plainly why the work stopped, e.g.
        "Your change to <App> stopped because the app was switched off."; the variants' exact words come back to him.
      - m104, [Leave it out] after an addition still saying "needs a Manifest administrator's look" — "Judge the net change
        (Recommended)": said from the net change against the live version, as the platform's gate decides. (Premise checked:
        the platform's sensitive diff counts a removal too, spec/diff.ts:107, so only the net change is self-serve.)
      - m119 — "You said no. It'll find out next time it tries." (Recommended), replacing "You said no, and it has been told."
      - m123, machinery words in a change plan's "Things we assumed" — "Re-ask once (Recommended)".
      - m109, a helper's band — "An agent is waiting for an owner's answer." (Recommended): "<App>: an agent is waiting for
        an owner's answer." with no [Agents] button.
    Built by the fresh front-end session manifest-app-f6, after manifest-app-5a's close.

    And at ~14:48 PDT, m104 RE-ASKED, its premise having been wrong: manifest-app-f6 measured that the front-end cannot read a
    change's net sensitive change (the contract carries only each commit's SpecValidation.sensitiveDiff against the newest
    valid manifest, and LaunchReadiness.sensitiveFields for the release serving staging; checked by manifest-94 in the
    contract). Through the question tool — "Ask the platform: FE-54 (Recommended)": a commit's spec validation reports its
    sensitive change against the last approved release, by the gate's own sensitiveFieldsBetween; additive, no spec action;
    the FE-46/47/5 plan's new Task 2b, in its sitting 2, beside FE-53. m104 stays open, over-saying, until it lands. Over: the
    front-end's own copy of the rule (it can under-say); leaving m104 as it is.

    And at ~14:51 PDT, the front-end's m69/m76 words (manifest-app-f6's draft), through the question tool:
      - THE THREE EMAILS — "Approve as drafted (Recommended)": subject "<App>: your change stopped"; "Your change to <App>
        stopped because the app was switched off. You can read where we got to in the conversation:" + its link; "…because
        the app was deleted." (no link); "…because you were taken off the app. Its owners can add you again." (no link); the
        usual last line; a "we need you" held about a minute and sent as one of these when the cause is seen; nothing to
        someone who left by their own word, nor when the watch's stop cannot be told apart.
      - A FIRST BUILD — "A separate first-build wording" (over the recommended one sentence for both), e.g. "Building <App>
        stopped because…"; its exact words come back to him.
      - THE FIRST-BUILD WORDS (14:52 PDT) — "Approve as drafted (Recommended)": subject "<App>: building it stopped";
        "Building <App> stopped because the app was switched off. You can read where we got to in the conversation:" + its
        link; "…because the app was deleted."; "…because you were taken off the app. Its owners can add you again."; the
        same last line; only the app's first build (the front-end's piece of kind 'first') uses them.

    And at 15:09 PDT, from manifest-app-5a's close (its minors round: 15 fixed), through the question tool — "Yes, alongside
    FE-53 (Recommended)": pending_action.created also carries the asking token's minter (tokenMintedBy, Token.mintedBy's
    value), so the front-end names an agent made outside its page to its own maker as "Your agent", consistently. Additive,
    in the FE-46/47/5 plan's FE-53 (Task 2, sitting 2). Over: leaving the band generic.

    And at 15:16 PDT, through the question tool — "Yes, its call (Recommended)": the front-end decides and words its minors
    m107, m112, m114 and m117 itself, any new words under his standing "approve, change on sight"; m111 waits for 7100.

    And at 15:20 PDT, through the question tool:
      - PASSPORT-UBCSHIB rc.2 — "Fix now as rc.2 (Recommended)": manifest-9d (sitting 5b) found that on 0.1.7-rc.1 every
        app answers an IdP-started single logout `Requester`/`UnknownPrincipal` (node-saml 5.1.1's strategy.js answers
        Success only when the logout verify's user deep-equals req.user; rc.1's default verify returns the logout profile —
        checked by manifest-94), and that `passReqToCallback: true` hands `req` in as the profile. A background agent of
        manifest-94's fixes both in the wrapper (the session ended before node-saml sees a SAMLRequest, a default logout
        verify returning null; the verify branching on passReqToCallback), tests them, pushes 0.1.7-rc.2 to PR #1; Rich
        publishes it. Manifest's blueprint carries its own workaround meanwhile (1dcb905). Over: documenting it.
      - A1's AUTOMATIC REPLACEMENT (manifest-27's questions) — "Skip the checklist (Recommended)": a replacement redeploys
        production's exact digest without §13's checklist, the approval-digest check kept; and "Yes, after ~1 minute
        (Recommended)": a member running but unhealthy for four watcher passes counts as an exit.
      - THE REVISED PLANS (2d74a5d) — "A1 and FE-32 now; B and A2 later (Recommended)": A1 (production instances) and
        FE-32 (dependencies, with the allowlist) APPROVED as revised; B (the load rehearsal) and A2 (hibernation) get a
        second fresh review when they are next in line.

    And at 15:28 PDT, the ORDER RE-CUT, in his words: "I think your suggestion of FE-46/47/5 → A1 → B → FE-32 → Phase 3 → A2
    is good. Let's document that." (manifest-94 had suggested it because A2 mostly saves idle cost, while FE-32 and Phase 3
    — a real harness that can sign in and test its own pages, S5 — are what make faculty apps work.) The order after
    faculty-ready is now: the UBC AI Gateway (below) → FE-46/47/5 → A1 → B → FE-32 → Phase 3 (sandboxes; unwritten) → A2 →
    the vulnerability database → FE-45.

    And, the same message: "I also need to add in the ability to use some infrastructure that we have spun up on prem (even
    locally, yes it will need the network on). We have an API service (which is actually LiteLLM) running at
    ai-gateway.apps.ltic.ubc.ca … we need manifest to be able to talk to that as an LLM provider. I can generate API keys on
    that service directly (I am an admin). Can we get this built into manifest fairly soon so we're not going direct to
    OpenAI, but rather through the LiteLLM 'AI Gateway' hosted at UBC?" Measured by manifest-94 first: the gateway answers
    from this laptop (/health/liveliness 200 "I'm alive!", /v1/models 401 without a key; 142.103.94.46/47); today
    `MANIFEST_CAPABLE_MODEL` registers `openai/<model>` with no api_key, so LiteLLM calls OpenAI directly with .env's
    OPENAI_API_KEY (ai/capable.ts), and the on-prem stand-in and `default-chat` are the laptop's Ollama. Through the
    question tool:
      - THE SHAPE — "As the upstream provider (Recommended)": Manifest keeps its own LiteLLM (per-person keys, budgets, the
        guard) and routes the capable model, and real on-prem models, through the UBC AI Gateway with one key Rich
        generates (held in .env, referenced, never printed); `default-chat` stays local, the offline floor. This DECIDES §8's
        open "should Manifest at UBC use UBC's existing LiteLLM?": keep our own, name UBC's as its provider. Over: replacing
        Manifest's LiteLLM with UBC's.
      - WHEN — "Right after faculty-ready (Recommended)": a small plan of its own, before FE-46/47/5.
      - WHO WRITES IT — "A fresh platform session now (Recommended)", documents only; Rich creates the key and adds it to
        .env before its sitting 1.

    And at 15:38 PDT Rich published passport-ubcshib 0.1.7-rc.2 under `next` (gitHead 4b200ff, 7 files; checked by
    manifest-94): single logout answers Success again and passReqToCallback is honoured. Asked whether honouring it
    breaks compatibility, he was told: no — 0.1.6 ignored the option, and none of the seven consumers nor Manifest's
    blueprint sets it on this library (tlef-biocbot's one use is `false`, on its passport-local strategy); kept as built.
    And he added UBC_AI_GATEWAY_API_KEY (a virtual key he generated on the gateway) to .env; at his word manifest-94
    recorded it, commented, in .env.example (20c65ca).

    And at 15:42 PDT, the gateway plan's two questions (manifest-b7; premises checked by manifest-94), through the question
    tool, each as recommended:
      - ON-PREM MODELS — "New names from one setting": MANIFEST_GATEWAY_MODELS=<name>=<gateway model>@<classification>,…
        registered at boot and removed when unset; default-chat-onprem stays the laptop's Ollama (C1, Spec action 8 as they
        are). Over: repointing default-chat-onprem; the capable model only.
      - /v1/responses ON AGENT KEYS — "Yes, in this plan, if measured": agent keys gain it, conditional on Task 1 measuring
        that the gateway's capable model refuses tools on chat completions (S5 found gpt-6-luna does); a §10 spec action
        drafted; app and intake keys keep three routes. Over: leaving it to Phase 3.

    And at 15:57 PDT, on the UBC AI Gateway plan (docs/superpowers/plans/2026-10-03-ubc-ai-gateway.md, f5faf87, by
    manifest-b7: 6 tasks in 3 sittings; two spec actions drafted), through the question tool:
      - "Quick review first (Recommended)": a read-only fresh reviewer of manifest-94's checks it against the code before
        he approves it. Over: approving now.
      - "Inline, a fresh session per sitting (Recommended)": executed inline, each sitting a fresh platform session from
        ORIENTATION §7e, manifest-94 coordinating. Over: subagent-driven.

    And at 16:13 PDT, on the gateway plan's fresh review (docs/superpowers/plans/2026-10-03-review-of-ubc-ai-gateway-plan.md;
    verdict: approve with fixes; one Critical — a gateway-key reference that resolves to nothing would very likely send the
    real OPENAI_API_KEY to UBC's gateway, and the 401 falls back silently), through the question tool:
      - THE KEY IN .env NOW — "Comment out the .env line (Recommended)": the boot's scrub list (secrets/scrub.ts) lacks
        UBC_AI_GATEWAY_API_KEY, and faculty-ready sitting 5b's close was about to restart 7100 from .env. manifest-94
        prefixed the line with "# " at 16:14 without reading its value; the gateway plan's sitting 1 adds the scrub entry and
        its test, then uncomments it. Over: a scrub-list code change now (it would void 5b's final gates); leaving it.
      - THE PLAN — "Approve with the fixes (Recommended)": APPROVED once a fresh session applies the review's fixes, before
        its sitting 1.
      - OPENAI_API_KEY — "Keep it as a backup" (over the recommended "required removal at sitting 2's close"): it stays in
        LiteLLM's environment; the review's other C1 fixes (fail closed, the four cases measured, a fingerprint) still apply.
      - THE VIRTUAL KEY'S CEILING — "Yes, before sitting 2 (Recommended)": Rich sets a max budget and budget duration on it in
        the gateway's admin UI; the figure is recorded when he gives it.

    And at 16:23 PDT, Rich's ceiling on the gateway's virtual key (UBC_AI_GATEWAY_API_KEY), set by him in the gateway's admin
    UI: a 20 USD budget that resets monthly, and a 90-day expiry — about 2027-01-01. Recorded in CLAUDE.md's Outstanding (rotate
    before it expires: an expired key answers 401, which the fallback turns into a silent switch to the on-prem model).

    And at 17:21 PDT, at faculty-ready sitting 5b's close (manifest-9d, 38c9251), through the question tool, each as
    recommended:
      - SITTING 7's ACCEPTANCE — "Add all three": Task 11 gains phases for Task 15 (an administrator who is a collaborator
        gives a reason beyond their role), Task 16b (a member's removal recorded exactly once) and Task 17 (the app's answer
        to the IdP's LogoutRequest decoded as Success, as s5b-edge-proof.sh's step 3 does).
      - THE BLUEPRINT'S passport-ubcshib PIN — "Once, at the final 0.1.7": no move to rc.2; one pin move and one lockfile
        regeneration after the developers confirm rc.2 on UBC staging and Rich publishes 0.1.7. Manifest is correct on rc.1
        meanwhile (the blueprint's own SLO workaround, 1dcb905).
      - SPEC ACTION 6 (§8's index.js line numbers; §9's "covers six names") — "Apply as proposed": APPLIED by manifest-94 at
        17:22. No shared page names the library; no code.

    Also recorded, no decision needed: the UBC AI Gateway plan is APPROVED with the review's fixes applied (manifest-cd,
    61d4557; Rich's "Approve with the fixes", 16:13). And manifest-app-f6 closed the front-end's fifth minors round
    (6280fe1): Rich's minors built word for word; new words of its own under "change on sight" — m117 "We couldn't copy it.
    Select it and copy it yourself." and m114 "We can't tell right now whether you can answer this."
