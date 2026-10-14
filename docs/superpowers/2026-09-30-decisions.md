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

    And at 17:23 PDT, the front-end's m133 (manifest-app-f6's close: a second copy of its server that fails to take 7105 still
    marks the live server's in-progress builds interrupted), through the question tool — "Fix it (Recommended)": a starting
    server makes sure it is the only one (it takes the port, or a lock) before marking anything interrupted; this overrides
    the F6b plan's Review Focus 3 wording ("marked before this server can listen"). For the next front-end session.

    And at 17:44 PDT, faculty-ready sitting 7's two (manifest-80; the classifier ALLOWED its restart of 7100 onto driver 1 at
    17:34, which it had refused at sitting 3), through the question tool, each as recommended:
      - THE .env SWAP FOR DRIVER 2 ON THE FAKE — "Yes, it does it": a 0600 copy of .env in the git-ignored workspace, only the
        `MANIFEST_SOURCE_DRIVER=`/`MANIFEST_GITHUB_` lines commented (no value printed) for the driver-2 legs, then .env copied
        back and proved byte-identical with `cmp`. Over: a script Rich runs; driver 2 not run.
      - `make reset` — "Yes, once": manifest-80 runs it once after its controls (the databases including LiteLLM's, the
        registry, the build cache, the fake's repositories and the mf- resources; NOT .manifest/repos, the seed cache, the CA,
        Ollama's models or the four protected containers — Makefile:83-88, checked), then fresh runs on both drivers.

    And at 18:19 PDT, faculty-ready sitting 7's CLICKED HALF, staged by manifest-80 (headless Chrome first, 20 of 20) and
    relayed by manifest-94 — Rich, in his words: "all done, all looked good". The five steps: the __Host- session cookie on
    console. and app. (HttpOnly, Secure, Path /, no Domain, no plain name); the operator (an administrator, not a member) on
    the instructor's project reading "You are not a member … Say why first"; a rename refused without a reason with its
    support reference shown, then saved with one; the instructor's events reading "Test Operator acted as a platform
    administrator — reason: '…'".

# Rich's decisions — 2026-10-03, 19:58 PDT (session manifest-af, the evening coordinator)

    Rich started manifest-af as the coordinator for the evening, with five fresh workers: manifest-ec (the UBC AI Gateway plan's
    sitting 1), manifest-61 (its sitting 2), manifest-be (its sitting 3), manifest-app-c1 (the front-end's sixth minors round,
    mock mode, m133 included) and manifest-app-79 (the front-end's F5b sitting 1 on 7100). Measured first, 19:53–19:55: HEAD
    b5e48ed; the flag FREE; 7100 PID 5301 on real GitHub; the gateway's /health/liveliness 200, so the network is on. Asked
    through the question tool, at 19:58, each answered as recommended:
      - THE 7100 ORDER — "Gateway Task 0, then F5b": manifest-ec does Task 0 entire (secrets/scrub.ts's name, pnpm test twice,
        boot.docker.test.ts, the two restarts by s7-cp.sh real, the uncomment, make doctor) and Task 1's Step 8 (make doctor/verify
        once), then hands 7100 to manifest-app-79's F5b sitting 1. Until F5b closes, the platform does none of these: restart 7100,
        run Vitest, make verify, make up, or cleanup --apply. manifest-ec carries on with Task 1's other steps on its own
        throwaway LiteLLM (gw-probe, 7197/7198), which touch neither. Its close runs no new pnpm test (Task 0 Step 4: those two
        runs are the close runs). Gateway sitting 2 waits for F5b's close and his words on Spec action 1.
        Rejected: gateway sitting 1 whole first, then F5b; F5b first.
      - THE .env LINE — "Yes, the plan's sed": after Task 0's commit and first restart, manifest-ec runs
        `sed -i '' 's/^# UBC_AI_GATEWAY_API_KEY=/UBC_AI_GATEWAY_API_KEY=/' .env`, then checks that
        `grep -c '^UBC_AI_GATEWAY_API_KEY=' .env` reads 1. Neither prints the value. Rejected: Rich uncommenting it himself.
      - THE EXPIRY LINE — "Yes, from /key/info": manifest-ec appends UBC_AI_GATEWAY_KEY_EXPIRES=<YYYY-MM-DD> to .env from
        Task 1 [M1].3's `expires` (Decision 11). If the key cannot read its own /key/info, the date comes from Rich's admin UI,
        asked through the coordinator. Rejected: showing him the date first.
    The probe key's file, named by the coordinator: /Users/rich/manifest-gw-probe.env (one line GW_PROBE_KEY=<value>, chmod 600),
    written by Rich, removed at Task 1's Step 10.

    And at 20:03 PDT, the gateway plan's SPEC ACTION 1 (§7, §21, §26 — UBC's AI Gateway as the platform's upstream provider),
    put to him before sitting 2, through the question tool. Its premises checked by manifest-af first: all five quoted passages
    exist in the spec (§7's catalogue at :511 and its sentence at :517, the fallback paragraph at :530, §21's LiteLLM row at
    :2165, §26's Platform settings at :2961-2965, wrapped). One mismatch found and put to him: the drafted §7 paragraph said an
    unpriced ON-PREMISE gateway model is charged the synthetic price. The plan (Decision 6; Task 3's test, plan:1126) pins
    only an unpriced CONFIDENTIAL one and refuses an unpriced internal one, because the platform sees a model's classification,
    never where it runs.
      - THE WORDS — "As proposed, 'confidential' wording" (Recommended): the five edits as drafted, with the price sentence
        reading "A model the platform cannot price is refused, except a `confidential` one, which is charged the on-premise
        model's synthetic price so budgets bind." No code change: an on-premise model he classifies `internal` that LiteLLM
        cannot price is refused, so he classifies it `confidential` or exposes it under a priced name.
        Rejected: word for word (Task 3 would need an @onprem marker apart from the classification); without the price
        sentence; a D35 row instead.
      - WHO APPLIES — "manifest-af, now" (Recommended): the coordinator applies it tonight, documents only, beside sitting 1:
        the spec, and manifest-schematic.html:1072-1073 ("a commercial provider's for now" becomes "a commercial provider's,
        through UBC's own AI Gateway, for now"). manifest-decisions.html's D17 is unchanged, as option (c) was not chosen.
        Rejected: sitting 2's worker applying it first.

    And at 20:07 PDT, four of the front-end's minors (the sixth minors round, manifest-app-c1). Their premises were checked by
    manifest-af against manifest-app at a01aed3. Asked through the question tool:
      - m16, the sign-off row's race (going-live.tsx:68-81 reads the checklist, then the approval; a decision between the reads
        draws "Signed off by a Manifest administrator." over a rejection, or "It has changed since it was signed off…" over an
        approval, until the page is shown again or pressed) — "Accept it" (over the recommended re-read when decidedAt is
        under a minute old). The platform's gate decides any press.
      - m46, a page opening on a round already at needs:{kind:'token'} renewing by itself (building.tsx:250-260) — "Interrupted
        card" (Recommended): it renews by itself only when this page watched the round go to needs:token. A page that opens on
        one already there shows the interrupted card and its press (needs.tsx:357; the existing words). No new words.
      - m67, the first keeping of an older app emailing one "still waiting" per long-stale wait an hour later (keeper.ts:399-401,
        :639-647; every restart postponing the scan an hour, :755) — "Accept it" (over the recommended kept_at column and a
        first scan a minute after start()).
      - m82, a member added since the last members read getting 201 on a change, then 404 on their own conversation
        (sharing.ts:23-27) — "Re-read on a stranger" (Recommended): when someone the kept members do not name asks for a
        change, read the members with that change's own token (platformWatching(...).members, platform/watching.ts:39) and
        keep them before answering. If the read fails, the old list and the 404 stay.
    Also recorded, no decision needed: m133's shape is the front-end's own, within his 17:23 ruling ("it takes the port"). The
    marks move into Fastify's onListen, before the keeper starts, with no lock.

    And at 20:21 PDT, m67's second half on its own (manifest-app-c1), its premise checked (keeper.ts:755's setInterval; :405's
    per-wait key) — "A minute after start" (Recommended): the first "still waiting" scan runs a minute after start(), then
    hourly. One timer, no new words, no store change. The rest of m67 stays "Accept it".

    And 20:14–20:25 PDT, the gateway plan's PROBE KEY (Task 1, What Rich does 3), made by Rich on UBC's gateway. The coordinator
    checked it by its shape and by GET /v1/models only, never printing the value:
      - The file /Users/rich/manifest-gw-probe.env: one line GW_PROBE_KEY=sk-…. Rich made it mode 644; manifest-af ran
        chmod 600 at his request to verify it.
      - Its models: Rich first gave it all models (/v1/models listed 10, 20:21). To restrict it he made a TEAM, restricted the
        team to one model, and regenerated the key; the file was rewritten at 20:25:11. /v1/models then answered 200 with
        exactly ONE model: qwen3.6-35b-a3b, the cheapest the gateway prices non-zero (0.05 / 0.10 USD a million tokens, by
        the gateway's own /model/info).
      - Its budget: 0.01 USD (Rich's words). GET /key/info on the probe key answers 403, so it cannot read its own budget.
      - In his words, a fact for [M9]: "that model won't actually cost UBC anything as it's hosted on prem, it's fine."
        qwen3.6-35b-a3b runs on UBC's own hardware.
      - The regenerated probe key expires in 1 day (Rich; the clock read 20:27 at its entry: "the key's expiry is 1d"; confirmed through the question tool
        to be the PROBE key, not UBC_AI_GATEWAY_API_KEY, which keeps its 90-day expiry of 16:23, about 2027-01-01). He has
        DELETED the first probe key (the all-models one) at the gateway. The regenerated one is deleted by him after Task 1's
        Step 10.

    And at 20:42 PDT (the clock at this entry), the gateway's models ([M1], manifest-ec, 20:35: ten models, read on the real key; the real key's
    /key/info answers 403, "only allowed to call routes: ['llm_api_routes']"), through the question tool. In his words:
      - gpt-6-luna, gpt-5.6-luna, gpt-5.6-terra, gpt-5.4-mini (provider openai; [M2]: OpenAI's public API, organisation
        ubc-ltic-incubator): "there's a difference between high risk and very high risk data at UBC. High Risk data should be
        fine hitting the OpenAI (which is off-prem) via the API. However, VERY high risk data is not. Details here:
        https://cio.ubc.ca/information-security/policy-standards-resources/U1 — So as long as the app isn't very high risk data,
        using the off-prem models should be fine."
      - llama3 (provider bedrock, AWS): "Same as OpenAI question before".
      - THE SELF-HOSTED FIVE: "phi3.5, llama3.1, and nomic-embed-text all run on old hardware on prem. They aren't really to be
        used. Do we need to know this info right now? I can get more details abut the onprem models later." ([M2]: qwen3.8-27b
        answers from a UBC host, *.arc.ubc.ca. He said at 20:21 that qwen3.6-35b-a3b is on prem.)
      - PROMPT RETENTION — "No, prompts aren't stored" (store_prompts_in_spend_logs off).
    manifest-af's reading, put back to him: the spec's classes are public | internal | confidential (§7) and map to no UBC
    U1 risk level. §7 (a confidential app's own AI never leaves on-premise hardware) and D17's why (student personal
    information to a US model is a privacy problem) stand as written. So for the plan, the off-prem models take `internal`,
    their max under the spec today. Whether Manifest's classes should map to U1's levels, so that High Risk may reach
    OpenAI and only Very High may not, is a SPEC question. It is to be drafted with U1 read, and is not tonight's blocker. The on-prem models'
    classifications are DEFERRED to sitting 2's close, when he chooses MANIFEST_GATEWAY_MODELS (What Rich does 5). Task 1
    does not need them, and the three on old hardware are likely left out.

    And at 20:52 PDT (the clock at this entry), the gateway plan's [M4] STOP (manifest-ec, 20:43, on gw-probe, Manifest's LiteLLM 1.98.0): a second key
    read the first key's stored /v1/responses answer (GET /v1/responses/{id} 200, /input_items 200 = the prompt), because
    responses are stored by default (store: true) and every Manifest key reaches the gateway on ONE upstream key. Nothing is
    exposed today: every key Manifest mints carries only the three routes (ai/keys.ts:22, agent-keys.ts:118, keys.ts:155;
    /v1/responses appears nowhere in src/, checked by manifest-af) and is refused /v1/responses with 403. [M4].8 measured
    gpt-6-luna calling tools on chat completions through both hops, so TASK 5 DROPS, Spec action 2 is NOT NEEDED, and the
    contract stays 1.6.0. Explained to Rich twice in plain terms, then asked through the question tool:
      - "Yes, measure it" (Recommended), answered before 20:48 (manifest-ec measured it at 20:48:32): whether two DIFFERENT virtual keys read each other's stored responses at
        UBC's gateway itself. Measured by manifest-ec at 20:48:32: YES. The real key's response (gpt-6-luna, store: true by
        default) was read in full by the PROBE key, on another team and restricted to qwen3.6-35b-a3b: GET 200 and
        /input_items 200. The response was then deleted (DELETE 200, GET 404). Only field names were recorded. A fact for Rich
        as the gateway's administrator: holding a response id is enough to read the conversation with any virtual key there.
      - THE PHASE 3 RULE — "Yes, a binding Phase 3 rule" (Recommended): when Phase 3 first gives any Manifest key
        /v1/responses, its plan must force store:false or refuse GET /v1/responses/{id} and …/input_items, with a test that one
        key cannot read another's answer. It goes in the gateway plan's findings, ORIENTATION §8, TRAPS and the roadmap's
        Phase 3 line. No code tonight. Rejected: a note in the findings only.

    And at 20:56 PDT (the clock at this entry), Rich ran operator's admin grant himself, in his terminal: the command manifest-be's classifier had
    refused ([Permission Grant], pre-authorised 13:45 for F5b sitting 1). Its output: "NOTICE: PUID opr000001 is now admin /
    Done. A session issued before this still carries the old role — sign in again."
    And the real gateway key's facts, read by him from the gateway's admin UI (the key's own /key/info answers 403): "The
    platform key has $30 budget. Expires Jan 1, 2027 at 3:23 PM. No rpm/tpm limits. All models. No fallbacks set up." So the
    budget is 30 USD, NOT the 20 recorded at 16:23. The gateway's own x-litellm-key-max-budget header reads 30.0 (manifest-ec,
    [M2]); CLAUDE.md's Outstanding is to be corrected at the day's sweep. UBC_AI_GATEWAY_KEY_EXPIRES=2027-01-01, appended by
    manifest-ec under his 19:58 yes. No gateway-side fallback exists, which settles [M9]'s second fact.

    And at 21:12 PDT (the clock at this entry), F5b sitting 1's CLICKED HALF (the front-end's F5b, staged headless by manifest-app-79: the rehearsal
    6/6, `MODE=edge check-slice.sh` 4/4), relayed by manifest-af. Rich, in his words: "I did the walk, all looked great." The
    six steps: a CWL sign-in on app. as instructor; the __Host-manifest_session cookie (Secure, HttpOnly, Path=/, no Domain);
    a planted plain manifest_session changing nothing; Going live's step-up, which sets __Host-manifest_stepup at Path=/; a real
    launch of f5b-measure-1 (a real private repository in Manifest-local-dev, his to delete); sign-out clearing the session.
    And the gateway's PROBE key: manifest-ec found its max budget at 0.10 USD, not 0.01 (x-litellm-key-max-budget: 0.1). Rich
    LOWERED it to 0.01 at manifest-af's ask, so (e) can be measured in a call or two, with no hammering.
    And the gateway-side FALLBACK manifest-ec found in the gateway's own router text, qwen3.6-35b-a3b → gpt-6-luna (his "no
    fallbacks" read the key's page): "Don't worry about the fallback that's currently set I can sort that later, it's not a
    blocker for us here." While it stands, qwen3.6-35b-a3b cannot be `confidential` (§7, Spec action 1). Sitting 2's close
    chooses MANIFEST_GATEWAY_MODELS knowing it.

    And at 21:17 PDT (the clock at this entry), the gateway plan's TASK 4 BRANCH (manifest-ec's [M5], 21:13; the premises
    checked against infra/litellm/manifest_guard.py's header and the plan's Task 4 by manifest-af). Every gateway failure
    measured falls back: (c-ii) a served model the key may not use 403, (d) a wrong key 401, (e) the key's budget spent 429
    budget_exceeded, (g) unreachable 500. (a) malformed 400 is refused, correctly. The ONE Branch-C case is (c-i), a model the
    gateway does not serve: 400 invalid_request_error, param None, which cannot be told from a malformed request but by its
    message text. So the guard refuses its fallback. No 422 found; (f) unmeasured, as no rate limit is set. Through the question
    tool — "Accept it" (the plan's Branch C (i); over the recommended boot probe, a make-verify-only probe, and matching the
    message text): no guard code, no probe. A withdrawn or mistyped gateway model answers every caller 400 until an
    administrator fixes the setting: loud, not silent. Letting every 400 with no param fall back was ruled out before asking,
    because it reverses §7's rule that a malformed request is the caller's to correct. Task 4 keeps its witness Docker cases
    for the cases that fall back.
    Also at the close of the front-end's F5b sitting 1 (manifest-app-79, 21:22): FE-55, a CWL app asking no attribute passes
    validation, builds and releases, then its staging deploy answers 500 INTERNAL (an unhandled SpEntityError from
    deriveSpEntity). It is in manifest-app's docs/api-findings.md:1728 (5e4a61d) for the platform's queue, not yet placed by Rich.

    And at 21:25 PDT (the clock read just before this entry), the gateway plan's F5, the llm_provider-* header leak (manifest-ec's sitting 1,
    spikes/gateway-baseline/README.md's "For sitting 2"). LiteLLM 1.98.0 forwards every gateway header as llm_provider-*
    (get_headers.py:7-38): the gateway key's budget and spend, and the answering model's upstream address, reach every app and
    agent. Where no fallback stands, the gateway's budget refusal reaches the caller verbatim, with the key's alias and last 4.
    The same header prices hop 1 at UBC's price (cost_calculator.py:1698-1712). Premise checked by manifest-af: apps reach
    manifest-litellm in-network, not through the edge (spec/injection.ts:112, config.ts:271). Through the question tool —
    "Strip after costing, else record" (Recommended): sitting 2 adds a hook to infra/litellm/manifest_guard.py that removes
    llm_provider-x-litellm-key-* and llm_provider-x-litellm-model-api-base from what callers receive, after LiteLLM has read the
    cost, tested against the stub. If no 1.98.0 hook can remove outgoing headers, it is recorded on the before-production list
    instead, and the sitting's record says so. Rejected: recording it until production; stripping at the edge only.

    And at 21:48 PDT (the clock read just before this entry), MANIFEST'S DATA CLASSES AGAINST UBC'S U1 (the question drafted by a read-only
    background agent of manifest-af: plans/2026-10-03-u1-classification-question.md; manifest-af checked it against U1 itself,
    fetched 2026-10-03, "Standard Last Revised: 2026-03"). The fact that decides it: U1 lists "student name", "Student ID or
    Employee ID" and "student grades" under HIGH Risk. Very High is SIN, government ID, bank account, PHI, passwords and keys,
    biometric and genetic data, and date of birth. U1 says nothing about where information may be processed. Through the question
    tool, in his words:
      - THE SHAPE: "Can we not just use the same names from the ISS U1? Very high risk forces on prem models only." So the
        classes become U1's own names, low | medium | high | very-high, and very-high means on-premise models only.
      - THE SOURCE of "High may reach OpenAI": "I can't send you a document but it's been deemed okay as long as ZDR is enabled
        (which it is for our org on open ai)". The OpenAI organisation behind UBC's gateway (ubc-ltic-incubator, [M2]) has zero
        data retention, per Rich.
      - TODAY'S THREE NAMES — "Keep them as aliases" (Recommended): accepted with fixed meanings, public=low, internal=medium,
        confidential=very-high. That mapping never widens: a confidential app stays on-prem. Additive, so contract 1.7.0, with no
        LiteLLM database or config migration. New manifests, the front-end and the docs use U1's names. Rejected: a clean rename
        (breaking: D23.8's new prefix).
      - llama3 ON AWS BEDROCK — "high, like OpenAI" (over the recommended "medium until checked"): his call that Bedrock's
        retention meets the same bar. Recorded as unverified here.
      - PLACEMENT — "Right after the gateway plan" (Recommended): a spec action, then a small plan of its own, before
        FE-46/47/5.
      - THE DRAFTER — "The background agent, tonight" (Recommended): documents only. Its words come to him to decide before the
        spec changes.
    Not Rich's alone, recorded for the external track (deferred 2026-09-30): under U1 §3.2.4 Manifest itself is likely a Very
    High Risk Electronic Service, which needs a Security Threat Risk Assessment and a Shared Responsibility Model (§4.2.3).

    And at 22:08 PDT (the clock read just before this entry), the gateway plan's SITTING 2 CLOSE LINES (What Rich does 5; drafted
    by manifest-61 at code level, its premises re-counted by manifest-af: .env's MANIFEST_CAPABLE_MODEL starts `openai/`, and
    MANIFEST_GATEWAY_MODELS is absent). `make up` had already run (21:36), so none is owed. Through the question tool, each as
    recommended:
      - MANIFEST_CAPABLE_MODEL — "ubc-ai-gateway/gpt-6-luna": the same model through UBC's gateway, measured through both hops
        (chat, streams, tools on chat completions, 35.2 s longest). Charged UBC's reported price on the 30 USD key; timeout
        60 s, no retries; its fallback stays default-chat-onprem. Rejected: keeping openai/gpt-6-luna direct;
        ubc-ai-gateway/gpt-5.6-luna (tools unmeasured).
      - MANIFEST_GATEWAY_MODELS — "ubc-qwen-27b only": ubc-qwen-27b=ubc-ai-gateway/qwen3.8-27b@confidential. It runs on UBC
        hardware with no gateway fallback seen. It is unpriced, so pinned at default-chat-onprem's synthetic $1/$3 a million. It
        has no fallback of its own, so offline a call fails. Not possible today: qwen3.6-35b-a3b (the gateway falls back to
        gpt-6-luna, and it is unpriced) and llama3 (unpriced); the fix for either is at the gateway. Rejected: adding an
        off-prem internal entry; none.
      - WHO WRITES THEM — "manifest-61, at your word": it replaces the capable line and appends the gateway line by sed/printf,
        reading no value, from a 0600 backup checked by cmp and deleted at its close, then restarts the control plane after the
        Docker tier.

    And at 22:21 PDT (the clock read just before this entry), THE U1 SPEC ACTION (plans/2026-10-03-u1-spec-action.md, drafted by
    manifest-af's background agent from his 21:48 decisions, then reviewed by a fresh read-only agent:
    plans/2026-10-03-review-of-u1-spec-action.md, "approve with fixes", C1 and I1–I9, and revised to it). It is DECIDED, NOT APPLIED.
    It is applied after the UBC AI Gateway plan's acceptance, before the U1 plan's first sitting. Through the question tool,
    each as recommended:
      - S10, does "very-high forces on prem" cover the agent that BUILDS a very-high app — "No, the building agent may use it":
        Spec action 10 stands; MANIFEST_AGENT_BUILDER_MODELS stays default 'capable' (config.ts:413). The 21:48 rule is about
        where a very-high app's DATA may go; the building agent sends the code and the person's description, never the app's
        data or its logs. Consistent with his 2026-09-28 words ("It's okay to use the larger models to BUILD the app…").
      - S9, a delegated token reading a HIGH project's staging and production Incident log tails — "Refuse at high and above":
        rank(level) >= rank('high') refuses them, whatever the capable model's level (releases.ts:1249-1257). A token's model is
        unattested. The front-end's repair loop reads the sandbox's freely.
      - S2, which names are `high` now — "Only what you decided": the gateway's OpenAI models (@high), the capable model while it
        is one of them, and llama3 once the gateway prices it. default-chat, -reasoning and -embed stay `medium` until an
        administrator attests their provider; the cost, accepted, is that a `high` app has no embedding or small chat model.
      - THE OTHER EIGHT — "All as recommended": (S1) the rule, `high` only if every provider that may answer, the vendor behind
        the gateway and any gateway fallback included, runs on UBC hardware or keeps nothing (ZDR), as the administrator attests;
        `very-high` only if all of them run on UBC hardware. (S3) The capable model's level is a setting of its own, default
        `medium`, set by him to `high`. (S4) A `high` project's building agent gets the capable model. (S5) An undeclared app is
        `medium`. (S6) The platform answers in U1's names. (S7) The spec's example app is `high`. (S8) Story 04 keeps its
        refusal, with a new reason. (S11) A lowered level takes effect at boot, and a key left with none is revoked.

    And at 22:55 PDT (the clock read just before this entry), two of the front-end's minors (its seventh round, manifest-app-cf;
    premises checked by manifest-af against manifest-app at 6bbbede plus the round's working tree). Through the question tool,
    each as recommended:
      - m99, a launched app's "Waiting to reach your students" naming the trying-out version twice (new-version.tsx:255's facts,
        live.tsx:532's press line) — "Drop the press's line after launch": after a launch the press keeps its button, stations
        and endings but not its "goes to" line. The facts stay whole and, by m136, a live region. The first-launch press keeps its
        line. Rejected: trimming the facts; accepting it.
      - m45, the Overview not learning of a launch made elsewhere while its draft serves nothing (overview.tsx:90, :124) —
        "Accept it". It needs a launch in another tab and a draft serving nothing, and a reload fixes it. Rejected: reading the
        checklist for every unlaunched app.

    And at 23:13 PDT (the clock read just before this entry), the project-less app containers, put to him before the gateway
    acceptance (TRAPS, "DOCKER DESKTOP RUNS OUT OF NETWORKS AT ~31"). There were 28 networks, 16 of them mf- networks held by 48
    mf- containers: the demos' apps and F5b's f5b-measure-1, every one with no project (the control database read 0 projects
    and 0 users at 23:12, since sitting 2's pnpm test). In his words: "Let's remove them now. Is there a script I can run to
    help? Unless that's going to cause a problem with currently running items". manifest-af wrote a script that removes
    nothing unless the control database holds zero projects. It runs `docker rm -f -v` on each mf- container, then
    dead-app-resources.sh --apply. manifest-be held its demos meanwhile. Rich ran it himself ("ok I ran it"). Measured after:
    12 networks, 0 mf- networks, 0 mf- containers. The four protected containers and the platform's own are running, and 7100
    is unchanged (PID 69387). The f5b-measure-1 repository on GitHub is untouched and still his to delete.

    And at 23:22 PDT (the clock read just before this entry), THE U1 PLAN (plans/2026-10-03-u1-classification.md, b2bb975, by
    manifest-17: eight tasks in three sittings). Its fresh read-only review (plans/2026-10-03-review-of-u1-plan.md): "approve with
    fixes", faithful to his 21:48 and 22:21 decisions; C1 task order (Task 2 switches the platform's answers to U1's names while
    releases.ts:1253, models.ts:37 and assessment.ts:97/207 still compare against 'confidential' until Tasks 3–5); I1–I7; 14
    minors. Through the question tool — "Approve with the fixes" (Recommended): APPROVED once manifest-17 applies every fix,
    documents only, each marked with the review's id, and manifest-af checks that C1's reorder landed. It runs right after the
    UBC AI Gateway plan, before FE-46/47/5. Rejected: a second review after the fixes; reading the review first.

    And at 23:31 PDT (the clock read just before this entry), two through the question tool:
      - m99 RE-ASKED, its 22:55 premise having been WRONG (manifest-af said the facts "stay whole"; new-version.tsx:254 hides
        them while a press holds the panel, so with the "goes to" line gone after launch nothing named the version for the
        minutes a press works; found by manifest-app-cf's fresh review) — "Line only while the press works" (Recommended): the
        "goes to" line is kept only while the press works or is unsure (live.tsx:552, :561), where the facts are hidden, and
        dropped from the offer and from `changed`, where the facts name the version. Over: as ruled at 22:55 (94350b3);
        showing the facts while the press works.
      - F32, STREAMED CALLS UNDERCHARGED (manifest-be, the gateway acceptance, 23:22–23:28): LiteLLM 1.98.0 sends stream_options
        to the provider, then charges its own count of the visible text. Manifest's charge ÷ the gateway's rise was 0.788
        (14 + 1 tokens recorded where the gateway counted 13 + 4), so reasoning tokens go uncharged; non-streamed calls match
        exactly. The front-end's agents stream (manifest-app model/client.ts:231). He answered "Fix it in this plan tonight",
        over the recommended "record now, fix as its own item" and "upgrade LiteLLM instead". So the gateway plan's sitting 3
        finds the drop point and corrects the charge (infra/litellm/manifest_guard.py's hooks, or where the measurement
        points), with a failing Docker case against the stub first and the Docker tier again. The acceptance's gateway-side
        check then compares the streamed call too. He also answered the placement question, "Right after the U1 plan"; it is
        moot unless tonight's fix cannot land, in which case F32 becomes its own item there.

    And at 23:40 PDT (the clock read just before this entry), F32's FIX (manifest-be's measurements, 23:3x–23:4x, in throwaways
    from the pinned digest and from v1.102.0, each torn down). LiteLLM 1.98.0 throws away a provider's streamed usage when it
    arrives on the final frame beside the choice, the shape UBC's gateway (a LiteLLM 1.102.0) sends: it was charged 14 + 1 by its
    own count where the provider reported 5 + 1. Usage in a frame of its own is charged right. The drop is in
    streaming_handler.py's assembly, and no CustomLogger hook of 1.98.0 sees the provider's figure. LiteLLM v1.102.0 charges the
    final-frame shape correctly (5 + 1) through openai/ and litellm_proxy/, and manifest_guard.py loads in it. Through the
    question tool — "Re-pin to 1.102.0, with a stop rule" (Recommended):
      1. a failing Docker case first, the stub's final-frame shape, red on 1.98.0;
      2. the digest moves in infra/images.txt:32, infra/lib/common.sh and doctor.sh's check, images.lock is regenerated, and
         `make up` recreates LiteLLM;
      3. that case goes green, then the whole Docker tier re-proves the guard on 1.102.0, then make verify and the demos.
    STOP RULE: if the tier shows the guard broken on 1.102.0, the pin goes back to 1.98.0 (one line, `make up`), and F32 is
    recorded for a plan of its own. It carries a one-line SPEC CHANGE he approved in substance: §21's LiteLLM row, "litellm 1.98.0,
    sha256:20b5044b…", becomes 1.102.0 and its digest, noting why (F32). Its exact words come back to him before the spec changes.
    Rejected: a version-locked patch of LiteLLM's internals; recording it for a plan of its own.

    And at 23:47 PDT (the clock read just before this entry), two:
      - THE RE-PIN'S SPEC WORDS (drafted by manifest-be, its quotes checked by manifest-af against spec l.2175 and l.1082), through
        the question tool, each as recommended, TO BE APPLIED ONLY IF the Docker tier is green on 1.102.0:
        * §21's LiteLLM row — "Two sentences": "Deployed **by digest**, recorded in `infra/images.lock` — litellm 1.102.0,
          `sha256:32cfd7a4…` — because `ghcr.io/berriai/litellm:main-stable` is a moving tag (it moved between 2026-09-07 and
          2026-09-09). It was re-pinned from 1.98.0 on 2026-10-03: 1.98.0 charged a streamed call by its own count of the visible
          text, not the provider's reported usage, so a model's reasoning tokens went uncharged (the UBC AI Gateway plan's F32)."
          The row's next sentence (§16's error mapping) stays.
        * l.1082 — "As proposed": "At LiteLLM 1.98.0, the version §21 pinned when this was measured (2026-09-07), an end user's
          budget lives on a *customer* row…" (dated history). l.438 is already dated and stays.
      - THE U1 PLAN: its review's fixes were applied by manifest-17 (eb5b82a, 23:24–23:46: C1, I1–I7, M1–M14, each marked).
        manifest-af CHECKED that C1's reorder landed: Task 1 makes every reader that compares against an old name level-safe
        (toLevel(x) === 'very-high' at models.ts:37, releases.ts:1253, assessment.ts:97/207, gateway-models.ts:135), with no
        change in behaviour; Task 2 is the switch. So the 23:22 approval STANDS. Recorded for the plan's Task 0: manifest-17 read
        E3's "its project's level" for S11's sweep as each running instance's frozen level (its Decision 8, the review's M12).
        If Rich wants the spec words to say so, the change is to E3's text when Task 0 applies it.

    And at 00:01 PDT on 2026-10-04 (the clock read just before this entry), the LiteLLM 1.102.0 Docker tier, half done (manifest-be): the GUARD
    is green on 1.102.0 (fallback-guard.docker.test.ts 29/29, the fallback refusals, F5's strip, F8's 422 and F32 included;
    capable 8/8; agent-sessions 4/4). ONE red outside the guard: ai-path.docker.test.ts, §16's pinned AI error mapping, the
    UNKNOWN-MODEL row (ai/errors.ts:131). 1.98.0 answered 400 with type "None" (AI_MODEL_UNKNOWN); 1.102.0 answers 400
    invalid_request_error, which falls to AI_UNMAPPED. No app key reaches the row: an app key's model list makes an unknown model
    403 key_model_access_denied, still mapped. Through the question tool — "Fix forward on 1.102.0" (Recommended): errors.ts
    recognises 1.102.0's shape (400, invalid_request_error, LiteLLM's own "Invalid model name passed in model=", matched as the
    budget row already is), with errors.test.ts red first on the recorded body. The 23:40 stop rule (the GUARD broken) did not
    fire. Rejected: pinning back to 1.98.0.
    Also, no decision needed: the gateway plan's one whole-branch review (manifest-be's, Task 6 Step 5) reads "with fixes", 0
    Critical and 4 Important. I1: a model the gateway prices at $0 may be charged $0 on 1.102.0 (ubc-qwen-27b streamed). I2:
    OPENAI_API_KEY can still reach UBC's gateway when the key is removed and the capable setting is refused, so ai/capable.ts
    removes every gateway deployment whenever .env has no key, and make verify fails while one is listed. I3: a spent budget
    (429) or a revoked key (401) falls back silently, so the guard writes one line per allowed fallback. I4: the acceptance
    goes green on 1.102.0. manifest-be fixes all four in sitting 3, each red first.

    And at 00:30 PDT on 2026-10-04 (the clock read just before this entry), THE GATEWAY ACCEPTANCE'S CLICKED HALF (Task 6 Step 4, staged by
    manifest-be, relayed by manifest-af). Before it: make demo-gateway three times green on LiteLLM 1.102.0; Manifest's charge ÷
    the gateway's own rise 1.000000000 each run, streamed calls included; the key 0 times in every log, output and database. Rich
    ran make demo-gateway himself and compared the gateway's admin UI. In his words: "I ran it separately, and yes the figures
    matched with the figures the script produced." Step 5, the expiry, rests on his 20:56 reading of the same admin UI ("Expires
    Jan 1, 2027 at 3:23 PM"), which the demo's printed .env date, 2027-01-01, agrees with. The half that has him build an app on
    app.manifest.internal was NOT RUN: the faculty front-end was in mock mode, not on 7100.

    And at 13:53 PDT on 2026-10-04 (the clock read just after his answers), THE U1 PLAN'S SITTING 1 OPENED (manifest-41; no
    coordinator live, so asked directly), three through the question tool:
      - the U1 spec action — "Apply it now (Recommended)": Task 0 applies the 22:21 words; the gateway plan's acceptance is closed.
      - E3's wording point (ORIENTATION §7e's first cold-start item) — "Name the frozen level (Recommended)": E3's last sentence
        reads "…every agent session loses each model its project's level no longer allows, and every running app's key each model
        the level of the release it runs no longer allows." So the spec says what Task 6 builds (its Decision 8, the review's
        M12). Rejected: the decided words with the reading recorded only in the plan; the project's current level for app keys
        (Task 6 reading classificationFloor, so a raise narrows a running app before its redeploy).
      - the project-less app containers (22 networks and 30 mf- containers at 13:51, the control database at 0 projects) —
        "You try it first": manifest-af's 23:12 script, unchanged but for its header, run by manifest-41 and ALLOWED. Measured
        after: 12 networks, 0 mf- containers, 39 volumes; the four protected containers running.

    And at 15:52 PDT on 2026-10-04 (the clock read just after his answer), THE U1 PLAN'S SITTING 2 OPENED (manifest-5b; no
    coordinator live, so asked directly), one through the question tool — §7e's single question (the plan's What Rich does 3):
      - MANIFEST_CAPABLE_MODEL_CLASSIFICATION=high in .env — "Yes, append at close (Recommended)": after Task 4 lands, the
        sitting appends the line with printf, reading no other value, and restarts 7100, whose boot line should read
        capableClassification high. LiteLLM last started 2026-10-04 00:14 PDT (docker inspect, 07:14:32Z) during the gateway
        plan's online acceptance, and the network was on at 15:51 (api.github.com answered 200). If the re-registration is refused
        as unpriced, Task 4 keeps the working medium row and the sitting records it. Rejected: Rich adding the line himself.

    And at 17:57 PDT on 2026-10-04 (the clock read just after his answers), THE U1 PLAN'S SITTING 3 OPENED (manifest-9f; no
    coordinator and no front-end session live, so asked directly), three through the question tool — ORIENTATION §7e's three:
      - the network, for make demo-gateway (Task 7 Step 2; Task 4 changed it to compare levels, sitting 2's F15 its first run) —
        "Yes, run it (Recommended)": on driver 1 with the network on, every call on the gateway key's budget. Rejected: run it
        last; record it NOT RUN.
      - the person's half (Task 7 Step 4) — "Stage it, I'll read (Recommended)": the agent stages a headless sign-in on
        manifest.internal under his standing yes and drafts the high project's privacy assessment; he opens it and reads the
        three lines. Rejected: he signs in himself; staged and left for later.
      - a restart or control refused by the classifier — "Yes, I'll run it (Recommended)": tried once first; on a refusal he
        runs scripts/levels-controls.sh with ! bash. Rejected: ask at each refusal.
    And at 18:03 PDT, sitting 3's second pair (manifest-9f), through the question tool, each as recommended:
      - THE .env SWAP FOR DRIVER 2 ON THE FAKE — "Yes, do the swap": faculty-ready sitting 7's, again — a 0600 copy of .env
        in the git-ignored workspace, only the MANIFEST_SOURCE_DRIVER=/MANIFEST_GITHUB_ lines commented (no value printed) for
        the driver-2 legs, then .env copied back and proved byte-identical with cmp; 7100 back on real GitHub at the close.
        Rejected: driver 1 only; a script Rich runs.
      - make reset — "Yes, once": after the controls, then a fresh make demo-levels on each driver (the control database held
        only the unit suite's fixture project, so no real-GitHub repository is orphaned). Rejected: no reset.
    And at 19:43 PDT (the clock read just after his answer), THE U1 ACCEPTANCE'S PERSON'S HALF (Task 7 Step 4), staged by manifest-9f
    (the console served by vite preview on 7104, 7100 on driver 1, make ci-acceptance's demo-levels run having drafted levels-local's
    privacy assessment): Rich signed in as instructor, opened levels-local's Records, and pasted the draft's *Where it flows* section —
    "Classification: High — every AI model the app uses must be approved for high data."; "default-chat-large: Approved for high data
    at most: it may be answered by a provider off-premise that keeps none of what it is sent (zero data retention), as the platform's
    administrator attests, so what the app sends it may leave UBC but is not kept there."; "default-chat-onprem: Approved for very high
    data: it runs on on-premise hardware, so what the app sends it stays there." — every line as Task 7 specifies, each with its source.

# Rich's decisions — 2026-10-08, 09:07 PDT (session manifest-coord, the coordinated run's opening)

    Rich opened the coordinated run of manifest-app's docs/plans/2026-10-06-coordination.md (written 2026-10-06 by
    manifest-app-2e with manifest-9c, at manifest-app f1a1d01): sixteen parked workers (manifest-p0…p5, manifest-p9,
    manifest-app-w1…w9) and manifest-coord, started last with the plan's prompt. Measured first, 09:02: manifest HEAD 6048dac,
    clean; manifest-app HEAD f1a1d01, clean, no worktrees; contract 1.7.0, 72 operations; the flag FREE, no Vitest; 7100
    PID 50455 (real GitHub, since 2026-10-05 16:00), 7104 the console, 7105 Rich's edge-mode front end (PID 51537, since
    2026-10-05 16:00), 7102 nothing; 12 Docker networks; the vulnerability database fresh until 2026-10-10. ONE PREMISE HAD
    MOVED since the plan was written, and question 5 was re-asked on it: 7100's only project, ask-my-notes (instructor's), is
    ARCHIVED — by instructor, 2026-10-06 16:04:56 PDT — its three sandbox instances gone, so the plan's W0 (ask for a change
    on it and read its COURSE_CODE lines) could not run without a restore and a redeploy.

    Asked through the question tool in two rounds of four, each with its options and a recommendation. Round 1, answered
    09:07:
      1. THE PLAN, AND P0 — "Approved; P0 now (Recommended)": the coordination plan is APPROVED AS WRITTEN (its status line
         read "Awaiting Rich's review of this file"), and P0 — the proof-app starter's COURSE_CODE read
         (blueprints/node-ts-mongo/starters/proof-app/server.js:150, read per request today) and AGENTS.md's two sentences,
         the roadmap's *Tracked defects found in use*, its two platform rows (ORIENTATION §8 Open's first item) — runs NOW,
         out of plan, beside FE-46/47/5's sitting 1; its tests after gate G1. Rejected: after FE-46/47/5; not in this run.
      2. THE EXECUTION METHOD FOR FE-46/47/5 (its *What Rich does* 1) — "Inline (Recommended)": superpowers:executing-plans,
         one sitting per session (P1–P5). Rejected: subagent-driven.
      3. P1'S TASK 1 STEP 7 (`pnpm test` once on the unchanged tree) — "Skip it (Recommended)": sitting 1 changes no code and
         owes no pnpm test (ORIENTATION §7e); [M7] still reads the EXPECT_ lines and the contract. Rejected: run it after G1.
      4. FE-55 (manifest-app docs/api-findings.md:1728 — a CWL app asking no attribute validates, builds and releases, then
         its deploy answers 500 INTERNAL, an unhandled SpEntityError) — "P1 measures, P4 fixes (Recommended)": P1 measures
         it beside [M4]; P4 fixes it inside Task 7, which already touches spec/ — validateSpec refuses it SPEC_INVALID at
         auth.attributes, and deploy refuses it typed. FE-55 is PLACED. Rejected: leave it unplaced.

    Round 2, answered 09:08:
      5. 7105 AND ask-my-notes (re-asked on the archived premise above) — "Let it go; A1 frees 7105 (Recommended)": NO W0.
         Gate G1 is met at once, so P0's tests (and anything else that empties 7100) may run in turn. manifest-app-w1 (A1)
         stops Rich's edge-mode tree (PID 51537) and RENAMES packages/server/.data/app.sqlite (with its -wal and -shm) to
         app-edge-ask-my-notes.sqlite — kept, never deleted or overwritten — then starts mock mode. A8's 7100 walk after P5
         proves both ask-my-notes fixes on a fresh app. The archived project's rows go at the first pnpm test. Rejected: A1
         restores ask-my-notes and runs W0 (two state changes and a deploy of his app); W0 waits for him.
      6. UNATTENDED (multi-select; an unticked one would be asked first) — ALL THREE TICKED:
           - "make refresh-vulndb": with the network on, whenever a launch would meet a stale database (from 2026-10-10:
             P3, P4, P5, A8);
           - "The .env swap to driver 2": for make demo-launch's second driver on the GitHub fake, as the U1 plan's sitting
             3 did — a 0600 copy of .env, only the MANIFEST_SOURCE_DRIVER= and MANIFEST_GITHUB_ lines commented (no value
             printed), copied back and proved byte-identical with cmp, 7100 back on real GitHub at the close;
           - "One make reset in P5": only if its acceptance needs one.
      7. SPEC EDITS WHILE HE IS AWAY — "Minor ones applied" (the option read: "The 2026-10-03 night shift's rule: I apply
         minor ones, each recorded for your review."). Rejected: hold them all (the recommendation). HOW manifest-coord
         applies it, as manifest-3d did on 2026-10-03: a worker that needs a spec edit drafts it as a Spec action (exact
         words, the section, why) and sends it to manifest-coord; no worker edits the spec. manifest-coord judges it minor
         and confidently right, or holds it for Rich. An applied one is recorded in the roadmap's *Spec actions raised by…*
         as "APPLIED under Rich's 2026-10-08 permission, judged minor by manifest-coord — for his review", its shared HTML
         pages swept, its commit alone, and listed in the report to him, so each is easy to revert. Anything that changes a
         decision of his, a security property or a section's meaning is NOT minor and waits for him. A classifier refusal of
         a spec read or edit is never worked around.
      8. manifest-app's DOCS SWEEPS — "The coordinator (Recommended)": manifest-coord edits manifest-app's docs/ORIENTATION.md
         (Where things stand, THE NEXT JOB) and docs/plans/roadmap.md between and after the app jobs; app workers send it
         their lines instead of editing those two files. Rejected: only the workers, one docs turn at a time.

    Told to him at the opening, not asked: once A1's first fix is on manifest-app's main, the stop-gap
    MANIFEST_APP_PLAN_MODEL=default-chat-large in manifest's .env may go — his edit, whenever he likes. And these always wait
    for him: P5's clicked half; A8's 7100 walk and click; the operator admin grant when a classifier refuses it; sudo;
    deleting a GitHub repository; anything a classifier refuses; any step a plan marks *stops and asks Rich*.

    And at 09:34 PDT (the clock read just after his answer), MINORS m143 (manifest-app-w1, A1; put to him through the question tool
    by manifest-coord, not blocking). Its premise checked against the code first: m123's re-ask, askAgainForMachinery
    (manifest-app packages/server/src/agents/change.ts:224-235 on main at ec7cf43), runs machineryIn over a change plan's
    "assumed" part alone; the other five parts are held to C3 by the prompt alone. Since A1's fix 2, the change planner also
    reads the sandbox's printed output (e.g. "Error: COURSE_CODE is required…", "file:///app/server.js:99"):
      - "(b) Every part + names (Recommended)": the same once-only re-ask (m123's "Re-ask once": the second answer is kept as
        written, never a third ask) runs over EVERY part of a change's plan, AND triggers when a code-like word copied from the
        printed lines (an underscore, a dot or camelCase — COURSE_CODE, server.js) appears in any part. Built test-first inside
        A1 before it merges. Rejected: (a) every part, machinery words only; (c) leave it to the prompt, A8's walk to show it.

    And at 16:09 PDT, A5'S THREE QUESTIONS (manifest-app-w5, F5b sitting 3, merged at manifest-app b836ba2; put to him in chat
    by manifest-coord, none blocking, each with a recommendation). His words: "go with your recommendations on all three". So:
      (a) A5's NEW WORDS, ours — APPROVED AS BUILT: the twelve gap questions; "We couldn't suggest an answer to this one from
          your app. Say what you know."; "Every question needs an answer before it's sent. “Not decided yet” is an answer."
          (replacing the F5b design's "Only the Privacy Office can answer this one…", untrue under his FE-46 (ii)); "We couldn't
          start it just now. Nothing is lost."; "The Manifest team handed it back." · "They'll be in touch about why."; and the
          history's two hand-back lines. Rejected: changing them now.
      (b) AN EMAIL TO THE OWNER WHEN THE MANIFEST TEAM HANDS A RECORD BACK — YES: a small follow-up of the front end's own
          ("your … came back from the Manifest team"; new words, ours, for him to see). Today nothing is sent. Rejected: the
          page and the history alone.
      (c) "NOT DECIDED YET" FOR A GAP ONLY UBC CAN SETTLE — KEEP AS BUILT: the agent suggests nothing there and the person
          writes it; the agent never takes the Privacy Office's position for them. Rejected: suggesting "Not decided yet".

    And at 22:44 PDT, THE FE-46/47/5 CLICKED HALF'S TIMING (manifest-p5 staged it at 20:07 on 7100, driver 1; flagged to him
    as BLOCKED ON YOU at 20:08). His words: "tomorrow morning is fine for the click". So the click is on 2026-10-09 in the
    morning; manifest-p5 keeps 7100 and the staging overnight (the agent's question in step F expires 2026-10-09 20:07 and
    is re-staged in under a minute if needed; the vulnerability database is fresh until 2026-10-10). A8's 7100 half waits
    for manifest-p5's close-out after that click. A8's three questions (the 7100 window, two real repositories, the click's
    scope) remain open with him.

# Rich's decisions — 2026-10-09, 10:35 PDT (session manifest-coord, the coordinated run's second morning)

    THE FE-46/47/5 PLAN'S CLICKED HALF (Task 9; staged by manifest-p5 at 20:07 on 2026-10-08, 7100 on driver 1; the steps
    A–F sent to him again at 09:57). He did it as instructor and as operator, and said, in his words: "All the steps worked as
    you described, all of the text is as you said it should be for both operator and instructor, including the email. Great
    work." Checked against the control database at 10:35 by manifest-coord: launchpath-clicksend's privacy assessment is
    `submitted`; launchpath-click's STAGING IAM registration is `sent` with sent_from `active`, asking for five attributes, at 10:33:33 (the change, step E — CORRECTED 10:50 by manifest-coord: this entry first said production's, from a query that did not print the environment; manifest-p5 read both through the API at 10:37 and production's is still `active`, nothing requested; manifest-p5's F20 rules it not blocking — the change is the same flow and words for either environment, Decision 21, and production's runs in every re-use `make demo-launch`); the
    agent's question on launchpath-clicksend is `confirmed` (step F). The clicked half is DONE; manifest-p5 records his words
    and closes the plan.

    A8'S HALF TWO (manifest-app-w8, F5b sitting 5 and F6b sitting 7's joint 7100 walk), three questions put to him at 07:57
    and 09:57. His words: "yes, yes, (i)". So:
      (a) THE 7100 WINDOW — yes: about 2½–3 hours after manifest-p5's close-out (A8's server in edge mode; agents type the
          laptop IdP's test users under his standing yes of 2026-10-03; the walk's app made through the front end's page).
      (b) TWO REAL PRIVATE REPOSITORIES in Manifest-local-dev that nothing deletes — yes: `a8-clocks-1` for the walk, and one
          for his own app at the click (his slug).
      (c) THE CLICK'S SCOPE — (i): the full path on his own app, as himself (~45–60 minutes): made on our page, the three
          cards through each send, the sign-off, the dry run, Let your students in, and [Ask UBC's identity team] once; A8
          plays the Manifest team and UBC. Rejected: (ii), the three sends only.

    And at 11:24 PDT, THE FIVE OPTIONAL QUESTIONS (none blocking; put to him with recommendations at 07:57, 09:57 and, in
    full, at ~10:40). His words: "go with your recommendations on all five". So:
      1. F16(b) — SHOULD A CHANGE TO A REGISTRATION UBC HOLDS IN FORCE BLOCK A FIRST LAUNCH? — (b): §13's first-launch row reads
         "UBC IAM's registration is in force (recorded `active`, not lapsed since) and covers the release; a change asked for or
         filed does not unregister it" — the after-launch predicate (`launch/readiness.ts`'s `iamItem` → `registrationInForce(row)`,
         and the mock's `iamItem`). A SPEC ACTION PLACED WITH A1 (production instances by audience): its sitting 1 drafts the Spec
         action from option (b)'s words and applies it, with the shared HTML pages swept; any wording beyond (b)'s goes to him
         first. Rejected: (a) keep it (the owner asks the team to hand the change back, launches, and asks again).
      2. A7'S PRESS (F6b Task 14, D14.6) — (a) *[Ask UBC's identity team]*, as built (moment 8's own press is already *[Ask for
         it]*). Rejected: (b) *[Ask UBC for it]*; (c) *[Send it to the Manifest team]*.
      3. FE-56 (the front end's finding: `sendIamRegistration` never checks that a draft was drawn from what a draft would be
         drawn from now) — CARRIED to the platform, placed with its next plan that touches `launch/records.ts`. Rejected: leave it
         the front end's alone.
      4. m167 (uid and eduPersonPrincipalName share the front end's words) — YES: [Take it out]'s change hands the planner the
         attribute's name; a small front-end follow-up. Rejected: as built.
      5. A8'S I1 (production's step waits on a Manifest team that never acts when UBC's registration is active but the newest
         version asks one attribute more) — (a): *needs you*, with a press that drafts the change and offers [Send it to the
         Manifest team]; a small front-end follow-up after F5b closes (new words, his to see). Rejected: (b) inside A8 now;
         (c) as built.

# Rich's decisions — 2026-10-13, 12:34 PDT (session manifest-coord, the coordinated run: A8's click blocked)

    A8'S CLICK (F5b sitting 5) STOPPED AT ITS FIRST BUILD. Rich's app reading-check-ins (6e079aa1-…, made 12:17:56 PDT) failed three
    builds (bd9a6936, 4a6ef907, b2a0b18e; 19:21–19:24Z), each BUILD_SCAN_BLOCKED: "1 high or critical finding(s) this build introduced:
    GHSA-jqcg-44mw-7w3h (proxy-addr) … — Update the dependency and rebuild." The front end showed reference 783B-300E. Measured by
    manifest-coord (7100's DB, read-only) and manifest-app-w8: the advisory is CVE-2026-90711 (IP spoofing via an IPv4-mapped IPv6
    trust subnet; proxy-addr 1.1.0–2.0.7; FIXED in 2.0.8 — OSV, Mend); it arrived with the 2026-10-09 vulnerability-database refresh
    (701d882), which is why a8-clocks-1 built on 10-09 and nothing node-ts-mongo builds now. Its source is the PLATFORM's blueprint:
    blueprints/node-ts-mongo/skeleton/package-lock.json (express 4.22.2 → proxy-addr 2.0.7, ~2.0.7 allows 2.0.8), copied into every new
    app; no agent may change the stack (the front end's lead.ts:121, FE-32). proxy-addr 2.0.8 is already in the offline mirror
    (verdaccio, 7108). Asked through the question tool, each with its options and a recommendation:
      1. THE PLATFORM FIX — "Bump the lockfile now (Recommended)": a platform session (the spare, manifest-p9), out of plan like P0,
         bumps proxy-addr to 2.0.8 in the skeleton's package-lock.json, offline from the mirror; it owes pnpm test twice and the Docker
         tier (blueprints/), plus a check that a fresh app's build passes its scan. Rejected: accept the finding until a fix (it changes
         a security gate — the spec); leave it and close without the click.
      2. RICH'S APP — "Delete it, start fresh (Recommended)": reading-check-ins (never launched) is deleted, which removes its
         repository Manifest-local-dev/reading-check-ins; after the fix he makes a new app, which copies the fixed lockfile. Rejected:
         the platform committing the bump into his app's repository.

# Rich's decisions — 2026-10-13, 14:36 PDT (session manifest-coord2, the coordinated run: A8's click)

    RICH'S CLICK (F5b sitting 5's clicked half, with F6b sitting 7's press, option (i) of 2026-10-09 10:35) — DONE, on his own new
    app, as instructor, after the proxy-addr fix (manifest 5869070; P9's close-out b4fb9b5) and the operator admin grant he ran
    himself at ~14:00 (the classifier refused it for manifest-p9: [Permission Grant]). What manifest-app-w8 saw, from our server
    and the platform: his app "Reading updates" (reading-updates; repository Manifest-local-dev/reading-updates, made 14:06:41 PDT)
    built at 14:10:38, its scan clean (the fix proved live on a new app's first build); Going live's three steps, the
    administrator's sign-off and the dry run 14:13–14:21, each send answered by A8's stand-in as the Manifest team and UBC;
    launched 14:21:56; the change "Show each student's affiliation with UBC (student, staff or faculty) beside their name" →
    its detail card → [Ask UBC's identity team] (14:28) → filed, submitted and active (production now registers ubcEduCwlPuid,
    mail, givenName, sn, eduPersonAffiliation) → the email "Reading updates: UBC's identity team answered" (14:29:01) →
    [Carry on] built (14:34:35). Nothing failed; the only platform blip was GET /v1/projects 500 at 14:06:46 (requestId
    020808f8-710e-44a9-9706-4c97d2ef207a), the create/list race b4fb9b5 records as a tracked defect. Asked through the
    question tool:
      1. HOW DID IT GO — his answer: "All worked, no notes". So the click is done and nothing read wrong; F5b may be closed
         EXECUTED and F6b sitting 7 done. Rejected: "Worked, with notes"; "Something was wrong".
      2. OUR NEW WORDS SEEN IN THE CLICK — "Sending it to the Manifest team…"; the chips "Waiting on the Manifest team" /
         "Waiting on UBC's identity team"; "UBC's identity team agreed. We can carry on."; the new-detail email — his answer:
         "Approve as built (Recommended)". Rejected: "Change some".
      And in chat at 14:37 PDT, his own words: "done — it all worked, address reading-updates".

# Rich's decisions — 2026-10-13, 16:01 PDT (session manifest-coord3, the second coordinated run's opening)

    Rich opened the second coordinated run of manifest-app's docs/plans/2026-10-13-coordination-2.md (written 2026-10-13 by
    manifest-coord2 at his request, at manifest-app fb3a968): seventeen parked workers (manifest-fix, manifest-a1-s1…s8,
    manifest-review-b, manifest-spare; manifest-app-m167, -i1, -minors9, -190, -walk, -spare) and manifest-coord3, started last
    with the brief's prompt. Measured first, 15:52: manifest HEAD 565cb04, clean; manifest-app HEAD fb3a968, clean, the main
    checkout only; contract 1.8.0, 76 operations; EXPECT_TESTS 3534, EXPECT_FILES 212; the flag FREE, no Vitest; 7100 PID 2683
    (real GitHub, from 5869070, since 13:46:52), 7102 the mock (69985), 7104 the console, 7105 our server in mock mode (64934),
    7106 LiteLLM, 7111/7112 Mailpit; 18 Docker networks; 7100's only project reading-updates (active), users colleague,
    instructor, student (members) and operator (admin); the vulnerability database fresh until 2026-10-15 23:32. EVERY FACT IN
    THE BRIEF RE-MEASURED EQUAL. The first run's ledger moved to .superpowers/sdd/coordination/ledger-run1.md.

    Asked through the question tool in three rounds (4, 4, 3), each with its options and a recommendation first. Round 1,
    answered ~15:57:
      1. THE BRIEF — "Approve as written (Recommended)": the second run's brief is APPROVED AS WRITTEN (its status line read
         "Awaiting Rich's review"). Rejected: change it.
      2. reading-updates ON 7100 — "Let it go (Recommended)": his launched app's rows go at the first truncating run (S1's
         Task 1 [M5]); its click is recorded (e44849f, dd7d9cb); Manifest-local-dev/reading-updates joins CLAUDE.md's unowned
         list, his to delete. Gate G1 is met. Rejected: keep it until a day he names (the platform lane parked till then).
      3. F16(b)'S BUILD AND THE THREE TRACKED DEFECTS — "Fold them into A1" (NOT the recommendation, "P0, out of plan, beside
         S1"). So: NO P0 in this run (manifest-fix stays parked, untouched); F16(b)'s build (launch/readiness.ts's iamItem →
         registrationInForce(row), and the mock's iamItem) goes INTO SITTING 2 (S2), beside Tasks 2 and 3 — its mock change a
         notice there (G3); the projects-list 500 (projects/repository.ts:215, FE-58 on the front end) INTO TASK 7 (sitting
         6, S6), which rewrites the same file; the event replay's clock order (observability/bus.ts:258) INTO TASK 6 (sitting
         5, S5), beside its observability/ migration; FE-56 (launch/records.ts's send never checks the draft against what a
         draft would be drawn from now) ITS OWN ITEM LATER — it stays in the roadmap's *Tracked defects found in use*, not in
         this run. S1 still drafts F16(b)'s Spec action from option (b)'s words and applies it (approved 2026-10-09).
         W2 (I1 (a), which reads §13's iamItem) therefore starts on S2's close-out. Rejected: P0 out of plan beside S1;
         leave the three tracked and build F16(b) alone in S2.
      4. SPEC ACTION A (the A1 plan's lines 845–877: §11's Driver runs a set per hostname; §11 *Redeploys* across a set; a
         production member that exits is replaced, backing off and stopping after three in an hour; §12's
         X-Manifest-Instance names the instance that answered) — "Approve as drafted (Recommended)": APPROVED; S3 applies it
         before Task 4, its shared HTML pages swept (manifest-schematic.html, manifest-decisions.html D29 — check). Rejected:
         decide later.

    Round 2, answered ~16:00:
      5. SPEC ACTION B (the A1 plan's lines 878–889: §24's counts as built — exactly 1, 2, 3 and 3; headroom the third
         instance; the count read from the audience at each deploy; a faculty app keeps nothing a person needs in its
         process's memory) — "Approve as drafted (Recommended)": APPROVED; S4 applies it before Task 5, its shared HTML pages
         swept (manifest-decisions.html D29, manifest-stories.html — check). Rejected: decide later.
      6. UNATTENDED (multi-select; an unticked one would be asked at the time) — ALL FOUR TICKED:
           - "make refresh-vulndb, network on": whenever a launch demo would meet a stale database (from 2026-10-16: S4–S8,
             W5), run by the 7100 holder between runs at manifest-coord3's word, the next build watched after (FE-57);
           - "The .env swap to driver 2": each sitting's second driver on the GitHub fake — a 0600 copy, the seven
             MANIFEST_SOURCE_DRIVER= and MANIFEST_GITHUB_ lines commented (no value printed), restored and proved
             byte-identical with cmp, 7100 back on real GitHub at the close;
           - "make reset in S7 and S8": their runs are from make reset on each driver;
           - "A1 inline execution": superpowers:executing-plans, inline, one sitting per session (the A1 plan's "whichever
             Rich chooses"). Rejected: subagent-driven.
      7. THE FRONT END'S JOBS (multi-select) — W1 (m167 and the minors bookkeeping), W2 (F5b's I1 (a); new words his to read
         later), W3 (the ninth minors round's batch as the brief lists it) and W4 (contract 1.9.0, after S6): ALL FOUR.
      8. W5 AND RB (multi-select) — BOTH: "RB: B's second review (Recommended)" — B's second fresh review beside S6–S8,
         documents only, its approval put to him at its close; and "W5: the 7100 walk after A1" — placed, on S8's close-out;
         its 7100 window and its one real private repository in Manifest-local-dev are still asked of him at the time.

    Round 3, answered 16:01:
      9. SPEC EDITS WHILE HE IS AWAY (beyond F16(b)'s, A and B) — "Night-shift rule (2026-10-03)" (NOT the recommendation,
         "Hold them all for you"). HOW manifest-coord3 applies it, as manifest-3d (2026-10-03) and manifest-coord (2026-10-08)
         did: a worker that needs a spec edit drafts it as a Spec action (exact words, the section, why) and sends it to
         manifest-coord3; no worker edits the spec on its own judgement. manifest-coord3 judges it minor and confidently right,
         or holds it for Rich. An applied one is recorded in the roadmap's *Spec actions raised by…* as "APPLIED under Rich's
         2026-10-13 permission, judged minor by manifest-coord3 — for his review", its shared HTML pages swept, its commit
         alone, and listed in the report to him, so each is easy to revert. Anything that changes a decision of his, a
         security property or a section's meaning is NOT minor and waits for him. A classifier refusal of a spec read or edit
         is never worked around. Rejected: hold them all.
     10. manifest-app's DOCS SWEEPS — "Yes, you may (Recommended)": manifest-coord3 edits manifest-app's docs/ORIENTATION.md
         (Where things stand, THE NEXT JOB) and docs/plans/roadmap.md between and after the app jobs; app workers send it
         their lines at close-out instead of editing those two files. Rejected: only the workers, one docs turn at a time.
     11. WORDS OF OURS STILL UNREAD (manifest-app ORIENTATION's For Rich row) — "Accept all as built (Recommended)": A1's
         PLAN_MODEL_NONE sentence; A2's two (withdrawn, carried); A4's card sentences and the email's "Your agent asked to …" /
         "<Name>'s agent asked to …"; A5's twelve gap questions and hand-back lines; A6's failed send, its unnamed attribute,
         I1's five refusals and the hand-back emails — ALL ACCEPTED AS BUILT. New words this run (W2's I1 (a)) still go to
         him. Rejected: list them to read; leave them open.

    Told to him at the opening, not asked: these always wait for him — S8's clicked half; S1's [M3] fork if a CWL sign-in
    cannot cross instances; B's approval; W5's window and repository; the admin grant when a classifier refuses it; sudo;
    deleting a GitHub repository; anything a classifier refuses; spec wording that is not minor (answer 9); any step a plan
    marks *stops and asks Rich*. And his, none blocking: the .env line MANIFEST_APP_PLAN_MODEL=default-chat-large (no longer
    needed); a8-clocks-1's leftovers and the unowned repositories (CLAUDE.md); P1's F3 and F16 (Postgres pinned by tag only;
    two operator lines logging a PUID), unplaced; the offline acceptance, owed; the gateway key's rotation before 2027-01-01.

    And at ~16:05 PDT, in chat to manifest-coord3 after the opening, THREE STANDING PERMISSIONS for this run, his words: "Also, I
    give permission to run the scripts which clear docker networks, images, containers etc. I also give permission to make edits
    to the spec or plans as agreed. In addition, I give persmission to run claude in chrome to test things in a browser should you
    need." So:
      - THE MACHINE-CLEANUP SCRIPTS — scripts/dead-app-resources.sh, scripts/app-images.sh and scripts/litellm-orphans.sh, bare and
        with --apply (Docker networks, volumes, images, containers and the like): allowed. This adds nothing to what may be removed:
        reading-updates' and a8-clocks-1's leftovers stay as recorded (his), and deleting a GitHub repository is still his.
      - EDITS TO THE SPEC AND THE PLANS "AS AGREED": the spec actions he approved (F16(b)'s, 2026-10-09; A and B above) and those
        applied under answer 9's night-shift rule; and the plans' corrections and placements his answers make (answer 3's placements
        in the A1 plan, the 1.9.0 lines, B's revision by RB). Not wording he has not agreed.
      - CLAUDE IN CHROME, to test things in a browser when needed (the laptop IdP's test passwords already his standing yes of
        2026-10-03, 186b181). Still his: a clicked half's purpose (a person seeing it), real UBC credentials, sudo.
    A classifier refusal is still never worked around; a permission said to manifest-coord3 is relayed to a worker as a record,
    never as his word in that worker's own session.

    And at ~16:28 PDT, in chat to manifest-coord3, A1's [M3] FORK (the plan's Decision 9; put to him at ~16:24 with a
    recommendation for each of two questions). manifest-a1-s1 (A1 sitting 1) measured at 16:21, at library level (two SP
    processes built by the skeleton's own auth/ubcshib.js on a built app image's node_modules — passport-ubcshib 0.1.7-rc.1,
    @node-saml/node-saml 5.1.0 — in a --network none container, a throwaway IdP key; the app-level form, a sibling of
    reading-updates' staging container with its env copied, was refused by the classifier [Production Reads] and never ran):
    a sign-in started on one instance and finished on another is REFUSED ("InResponseTo is not valid") — the skeleton sets no
    validateInResponseTo, passport-ubcshib turns that into 'always', and node-saml keeps each AuthnRequest's id in a
    per-process memory cache. The same mechanism already fails a sign-in in flight across a REDEPLOY with one instance
    (pre-existing, newly recorded). His words: "I'm confortable going with your recommendations." So:
      1. THE FIX — "(1) The request cache in the app's own Mongo (recommended)": skeleton/auth/ubcshib.js passes node-saml a
         cacheProvider — saveAsync/getAsync/removeAsync on a Mongo collection with an 8-hour TTL index, on the client
         session.js already holds; passport-ubcshib unchanged. Measured with a shared cache: all four orders sign in, a replay
         is still refused. Closes the sign-in across instances and the redeploy case; apps made before the change keep the
         in-memory cache. Rejected: (2) sticky routing by an edge cookie (Caddy sets SameSite=Lax, so the IdP's cross-site POST
         would not carry it; uneven spread; the redeploy case left open); (3) validateInResponseTo 'never' (turns off the
         replay check: a security weakening).
      2. WHEN — "(a) Sitting 3, beside Task 4 (recommended)": Task 8's skeleton half (ubcshib.js, its starter, the
         skeleton's Docker tier, blueprints/) moves from sitting 6 into sitting 3, so it lands before sitting 4 puts every
         launch demo's class production on two instances. Task 8's knowledge-pack paragraph stays in sitting 6. Rejected: (b)
         its own sitting between S2 and S3; (c) sitting 2.

    And at 18:13 PDT (the diff's own stamp), RICH RAN THE PERMISSION SCRIPT himself (`! bash …/apply-permissions.sh`, written by
    manifest-coord3 after its own edit was refused [Self-Modification]), applying what he chose through the question tool at ~16:10
    ("Apply all recommended (Recommended)"; rejected: show the JSON first; do it himself by hand). Backups at <file>.bak-2026-10-13.
      - ~/.claude/settings.json autoMode.allow gained three lines (approved spec actions to docs/superpowers/specs/ and reading any
        file in manifest and manifest-app; docker kill/stop/rm/restart of mf-* and session-made throwaways, and the three cleanup
        scripts with --apply; scripts/admin-grant.sh grant opr000001); autoMode.environment's "Protected deployment namespaces"
        line REPLACED by "Manifest's environments are LOCAL simulations…" (sandbox/staging/production are laptop simulations;
        the only real external services GitHub's Manifest-local-dev and UBC's AI Gateway); soft_deny unchanged (the spec guard
        kept). `claude auto-mode config` read the new allow lines back.
      - manifest/.claude/settings.local.json permissions.allow gained: Bash(bash scripts/admin-grant.sh grant opr000001 *),
        the three cleanup scripts, Bash(bash scripts/gateway-controls.sh start real), Bash(make refresh-vulndb), Bash(make reset),
        mcp__claude-in-chrome__*; manifest-app's gained mcp__claude-in-chrome__*.
      Rejected at the same time (recommended against, not offered to apply): an allow for security-weakening negative controls
      (they stay a script he runs), and treating a coordinator's relay as his word.

    And at ~18:14 PDT, in chat to manifest-coord3, after it laid out everything waiting for him with options and recommendations
    (~17:55), his words: "and I'm happy to go with the recommendations for all of the other items waiting on me, thank you." So:
      2. reading-updates' AND a8-clocks-1's LEFTOVERS — "(a) Remove them now": their 18 containers (~900 MB), 6 networks and 12
         volumes, rows gone, are removed by the platform lane between runs (manifest-a1-s2 at its close-out), then the cleanup
         scripts. The fact behind it, measured: `make reset` (Makefile:107, approved for S7 and S8, answer 6) removes every mf-*
         container, volume and network anyway. Rejected: (b) leave them to S7's reset; (c) keep them past S7.
      3. FE-59 (manifest-app 54571a0; iam_registration.recorded carries no changeRequestedFrom, which the record holds) —
         "(a) Fold it into S5, beside Task 6": the event carries changeRequestedFrom as the record has it, inside contract 1.9.0
         (Task 6 already edits observability/event-schemas.ts), so W4's adoption picks it up and closes m178. Rejected: (b) a
         fix after A1 (another contract bump against B's 1.10.0); (c) leave it tracked.
      4. WORDS AND THE FRONT END'S SMALL QUESTIONS —
         - A7's remaining words ACCEPTED AS BUILT: "We couldn't send it to the Manifest team just now. Nothing has changed.";
           "What it needs from UBC's identity team has changed, so nothing was sent. Read it again, then ask."; the email
           "UBC's identity team answered about the new detail "<title>" needs for <App>. The conversation says whether we can
           carry on:"; and A6's hand-back email's "request" for "change".
         - A2's (i) — YES: Keeping watch tells an app's owners when a model their app uses is withdrawn (ai.models_withdrawn);
           new words, ours, for him to read after. A2's (ii) — NO: a person is not told separately that their app's level
           rose (the level shows on the app's page; a rise withdraws nothing it uses).
         - A TENTH MINORS ROUND NOW, in mock mode, beside the run: m145, m140, m154, m168, m171, m173, m174, m176, m177, m179
           and A2's (i) — the words drafted by us, his to read after (as A5's and A6's were). Rejected: list the words for him
           first; leave them until after A1. (The tab: manifest-coord3's call — manifest-app-spare, so he opens nothing now; a
           later failure in the app lane asks him for manifest-app-spare2.)
      5. THE UNOWNED REAL REPOSITORIES — "(a) Delete them, and the matching mirrors, keeping any he wants (perhaps
         ask-my-notes)": a8-clocks-1, f5b-measure-1, f6-watch, f6b-measure-1, keep-walk-1002 and reading-updates, by the
         platform's own `bash scripts/github-real-repos.sh --delete <name>` (it deletes only a repository no project row names,
         after reading "yes"), run by HIM, and their .manifest/repos/<slug>.git mirrors; ask-my-notes KEPT unless he adds it.
         Rejected: (b) leave them.
      6. Housekeeping stays his, as listed (the .env line, the offline acceptance, the gateway key's rotation and the PROBE
         key; P1's F3 and F16 to be placed in a later plan).

    And at ~18:41 PDT, in chat to manifest-coord3, FE-60's PLACEMENT (manifest-app 3ba0cab, written by W6 for m177:
    iam_registration.sent and .submitted carry no requestedAttributes, though the record holds them, so the front end cannot
    tell one detail's change from another's while it waits). Put to him with a recommendation: beside FE-59 in A1's sitting 5
    (Task 6 edits the same launch events, inside contract 1.9.0). His words: "yes, put FE-60 in sitting 5". So sitting 5 makes
    iam_registration.sent and .submitted carry requestedAttributes, as the record has them, beside FE-59's changeRequestedFrom
    on .recorded. Rejected: a fix after A1; leave it tracked.

    And at ~19:38 PDT, in chat to manifest-coord3, THE SKELETON'S DEVELOPMENT ERROR PAGE (A1 sitting 3's F11, pre-existing:
    blueprints/node-ts-mongo/skeleton/server.js mounts no Express error handler and NODE_ENV is set nowhere — not in
    Dockerfile.tmpl, server.js or spec/injection.ts — so a failed CWL sign-in, or any route that throws, shows the person
    Express's development page with a stack trace and container paths, in every app made from the skeleton). Put to him with
    options and a recommendation; his word: "both." So, in A1's SITTING 6 beside Task 8b (blueprints/ owed there; no contract
    change): an error handler as the skeleton's last middleware (console.error the error, never a secret; answer 500 with one
    plain sentence, no stack) AND `ENV NODE_ENV=production` in Dockerfile.tmpl's runtime stage, after `npm ci` (the install
    unchanged); tested by a blueprints-tier case and a Docker-tier read of a refused sign-in's body. Apps made before keep
    their copy. Rejected: the handler only; NODE_ENV only; leave it tracked.

    And in the same message, A STANDING DELEGATION FOR THE REST OF THIS RUN, his words: "For future questions over this
    session, please lock in your own recommendations. I trust you to make the right decisions for the project." HOW
    manifest-coord3 applies it: every question that would have gone to Rich is decided on manifest-coord3's own
    recommendation, after checking its premises in the code, and recorded here as "decided by manifest-coord3 under Rich's
    delegation of 2026-10-13 ~19:38 — for his review" (the option chosen, those rejected, why), its commit alone, and listed in
    the report to him so each is easy to revisit. Spec wording follows it too (applied, swept, its commit alone, marked for his
    review). What it does NOT change: what only he can DO — run a command the classifier refused in a session, sudo, his own
    credentials, and a person's click (S8's clicked half is a person seeing it) — still comes to him as an action, flagged;
    a classifier refusal is still never worked around.

# Rich's decisions — 2026-10-13, 20:15 PDT (session manifest-byoa-coord, the BYOA planning run)

    Rich opened the bring-your-own-agent planning run of manifest-app's docs/plans/2026-10-13-byoa-planning.md (written
    2026-10-13 ~20:10 by manifest-coord3 at his request, at manifest-app 686ee9f): four parked workers (manifest-byoa-plan,
    manifest-app-byoa-plan, manifest-byoa-review, manifest-byoa-spare) and manifest-byoa-coord, started last with the brief's
    prompt. A PARALLEL coordinator beside manifest-coord3's second run, DOCUMENTS ONLY: no tests, Docker, make, demo, server,
    ports 7100-7199 or the platform-window flag. manifest-coord3's standing delegation (~19:38) is its own and does not extend
    to this run. Measured first, 20:11: manifest HEAD 028bb94 (the second run's uncommitted ORIENTATION, roadmap, A1 plan and
    ci-acceptance.sh in the tree — not this run's); manifest-app HEAD 686ee9f, clean but Rich's .claude/; contract 1.8.0.
    THE BRIEF'S SURVEY RE-CHECKED — every line holds but two, each corrected here and in the GOs:
      (a) the fixed 600 requests a minute is the column default delegated_tokens.rate_limit
          (packages/control-plane/src/db/schema.ts:481), enforced in memory (api/server.ts:341); MintTokenRequest takes only
          name, capabilities and expiresInDays (api/representations/tokens.ts:103-130). The brief's api/routes/tokens.ts:114 is
          an example response.
      (b) "an owner revoking a collaborator's agent" is FE-11's option (b), which Rich DECLINED on 2026-09-29 (he chose (a):
          removing a member revokes their tokens — built by the launch path's Task 8; api/routes/tokens.ts:347-351). BP may
          put it to him again with the new reason (an outside agent), never assume it.

    Asked through the question tool in one round of four, each with its options and a recommendation first; answered ~20:15:
      1. THE BRIEF — "Approve as written (Recommended)": the BYOA planning brief is APPROVED AS WRITTEN (its status line read
         "Awaiting Rich's approval at your opening"), with the two survey corrections above. Rejected: change it.
      2. THE SPLIT — "Split it, after FE-32 (Recommended)": a plan "BYOA on the laptop" — the MCP server (§22), FE-19 (a
         toolkit's know-how served by the API), token controls (a rate limit set at mint, §20's per-token quotas, and FE-11
         (b) re-asked) and whatever else its design finds — comes OUT of Phase 3 and is PLACED BETWEEN FE-32 AND PHASE 3:
         ... A1 -> B -> FE-32 -> BYOA on the laptop -> Phase 3 -> A2 ... The reason given: FE-32 brings §12's package
         allowlist; today any npm package is proxied, and an outside agent running npm on its own machine can commit any
         lockfile. Its Spec action (§17's Phase 3 row; §22's "It lands in Phase 3, when sandboxes make the agent story real",
         l. 2471) is DRAFTED in BP's plan, never applied by this run. Rejected: split it, before FE-32; leave MCP inside
         Phase 3.
      3. THE FRONT END'S HALF — "All of it, after BP's design (Recommended)": BF designs and plans the "Start your agent"
         panel on the Agents screen (the address, how the key is sent, the guide, a prompt to paste, per-tool setup — an MCP
         configuration for Claude Code; Codex — preset permissions, which powers come back as a question) AND their agent's
         work shown beside ours (Conversations, who is working on the app); C3 holds. BF STARTS WHEN RICH APPROVES BP'S
         DESIGN, so what it shows is what the platform will offer. Rejected: all of it, start BF now; the panel only; not now.
      4. THE POLICY BRIEF — "Fold it into BP's plan" (NOT the recommendation, "its own file, for the Privacy Office"): there is
         NO separate policy brief file. BP's plan carries it as a SECTION — what an outside agent's provider would see (code,
         member names, build logs, redacted sandbox output, low/medium staging and production Incidents) and the questions
         only Rich or UBC can answer (commercial agents on UBC app code and the platform PIA; ZDR widened to providers nobody
         attests, S9; non-faculty agents, FE-39 "for now"; FE-24's tokens deploying to staging; commit author names reaching
         GitHub). Rejected: its own file, for the Privacy Office; not now.

    So BP's GO is sent now, citing this entry; BF's waits for Rich's approval of BP's design; BR's for both plans written.

# Rich's decisions — 2026-10-13, 20:31 PDT (session manifest-byoa-coord, the BYOA planning run: BP's design)

    BP (manifest-byoa-plan) committed its design DRAFT at 3dfc096 (docs/superpowers/plans/2026-10-13-byoa-on-the-laptop-design.md,
    sections 0-8, every one PROPOSED) and sent four questions with the rest for approval as written. manifest-byoa-coord checked
    the premises in the code first (at 3dfc096): 7101 and 7113 unassigned in infra/lib/common.sh:75-95; infra/caddy/Caddyfile:51
    and :124 are the console. and app. site blocks, their @api matchers at :68 and :141; build/secret-patterns.ts has no rule for
    mft_ or sk-; the skeleton's package.json:12-13 carries passport-ubcshib 0.1.7-rc.1 and ubc-genai-toolkit-llm 0.7.0;
    Token.mintedBy exists (api/representations/tokens.ts:24); revokeToken is minter-only (api/routes/tokens.ts:347-351); §22's
    "It lands in Phase 3, when sandboxes make the agent story real" is spec l. 2472 (the 20:15 entry said 2471). One caveat added
    to question 4: Codex may be configurable for chat completions; Task 1 measures it too.

    Asked through the question tool in two rounds, each with its options and a recommendation first; answered ~20:28 and ~20:31:
      1. THE SHAPE (§1) — "Served at /mcp beside /v1 (Recommended)": a separate host process, packages/mcp, importing only
         @manifest/contract, speaking MCP's Streamable HTTP transport, reached through the edge at /mcp on the app. and console.
         origins; an agent's setup is a URL and an Authorization header; the token never in the model's context. Rejected: a
         local stdio package (npx @manifest/mcp — publishing is outward and Phase 5's question); inside the control plane
         (contradicts §22).
      2. FE-11 (b), RE-ASKED (§3c) — "(b) owner/admin may revoke (Recommended)": an owner of the project, or a platform
         administrator (§26's reason when not a member), may revoke ANY token on the project; revokeToken's check widens from the
         minter to the minter, an owner or an administrator; the same transaction ends its questions and sessions and closes its
         streams; the event names who revoked whose. THIS REVERSES HIS 2026-09-29 CHOICE OF (a) ALONE — (a), removing a member
         revokes their tokens, stays built; (b) is added beside it, for the new reason (an outside agent is code nobody at
         Manifest wrote). Rejected: keep 2026-09-29's decision.
      3. THE FIRST TOOLKITS (§4, FE-19) — "CWL + models, already wired (Recommended)": the toolkit catalogue
         (toolkits/<name>/toolkit.yaml beside blueprints; listToolkits, getToolkit, getToolkitKnowledgePack; no new manifest.yaml
         field) ships with the two toolkits node-ts-mongo@1 already wires — CWL sign-in (passport-ubcshib) and models
         (ubc-genai-toolkit-llm). Rejected: those two plus one new library toolkit; the machinery only.
      4. WHAT AN OUTSIDE AGENT THINKS WITH (§5.2) — "Unchanged; measure at Task 1 (Recommended)": model keys keep chat
         completions, embeddings and models only; the outside agent thinks with its own provider and the plan's policy section
         asks UBC whether that is allowed; Task 1 measures Claude Code thinking on a Manifest key through LiteLLM 1.102.0's
         /v1/messages (one gateway call), and Codex's configuration. So Spec action F is DROPPED. Rejected: keys gain
         /v1/messages now; and /v1/responses for Codex under the Phase 3 rule.
      5. THE REST, AS WRITTEN — "Approve as written (Recommended)": §2 (stateless, bearer only, an Origin header and a cookie
         refused, one tool per operation a token may call plus waitForBuild and waitForPerson, a coverage gate,
         read/destructive hints, tested against manifest-mock); §3a (a rate set at mint, 1 to 600 a minute, default 600); §3b
         (daily per-token quotas on builds, deploys, commits and dependency resolutions, COUNTED IN A SMALL RECORD OF THEIR OWN —
         BP's correction after the draft, since FE-32's resolution publishes no event and a deploy publishes one per instance —
         starting 100/100/500/50, set from Task 1's measurement, 429 TOKEN_QUOTA_EXHAUSTED); §5.1 (mft_ and sk- in the secret
         scanner); §5.3 (@manifest/contract stays private); §5.4-5.5; §6 (the policy section, P1-P5); §7 (Phase 5 recorded, not
         planned); §8 (placement A1 -> B -> FE-32 -> BYOA on the laptop -> Phase 3 -> A2; Spec actions A-E drafted; contract
         ~1.12.0; make demo-byoa, either driver; Rich clicking a real Claude Code). Rejected: approve with changes; hold it.

    So BP'S DESIGN IS APPROVED WHOLE. BP writes the plan from it (docs/superpowers/plans/2026-10-13-byoa-on-the-laptop.md), and BF's
    GO is sent now (the brief's answer 3: BF starts on this approval), citing this entry.
