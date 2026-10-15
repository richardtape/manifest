/* The mockup's data. Shapes and platform wording are read from the published contract
 * (v1.3.0, refreshed against v1.9.0 on 2026-10-14), manifest-mock's fixtures and the control plane's event publishers; the projects,
 * people and tickets are invented examples. Times are relative to when the page loads, so
 * every age on the page is real arithmetic and ticks. Assigns window.ADMIN_DATA. */
(function (global) {
  'use strict';

  var NOW = Date.now();
  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  function ago(ms) { return NOW - ms; }

  // A stable, digest-shaped value per name, so the examples look like what they stand for.
  function digest(seed) {
    var x = 2166136261, out = '';
    for (var i = 0; i < 64; i += 1) {
      x ^= seed.charCodeAt(i % seed.length) + i * 131;
      x = Math.imul(x, 16777619) >>> 0;
      out += (x >>> 7 & 15).toString(16);
    }
    return 'sha256:' + out;
  }
  function uuid(seed) {
    var d = digest(seed).slice(7);
    return d.slice(0, 8) + '-' + d.slice(8, 12) + '-4' + d.slice(13, 16) + '-8' + d.slice(17, 20) + '-' + d.slice(20, 32);
  }

  // manifest-mock's own values, verbatim.
  var FIXTURE_DIGEST = 'sha256:9b2c1d0e3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4';
  var REVIEW = {
    state: 'not_performed', reviewer: 'none',
    detail: 'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the controls that make that tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20).'
  };
  var COVERAGE = 'An administrator sees a first launch and any release that changes a sensitive field (§7). A release that changes none reaches production without an administrator, and its code is reviewed by nothing (§13’s residual risk); containment is the control (§20).';
  var NOTES = {
    'egress.allow': 'The app may send data to a host it could not reach before. Default-deny egress is §20’s containment for unreviewed code, and this widens it. An input to the PIA’s “where it flows”.',
    'ai.models': 'A model change can move personal information to a different jurisdiction, which invalidates an approved PIA (§7, §9) — the administrator decides whether the PIA must be reviewed again.'
  };
  var SCAN = 'grype v0.118.0 · database 3 days old · introduced: 0 fixable, 2 high with no fix · base image: 4 critical, 14 high';

  /* ---------------- the fleet ---------------- */

  function env(state, deployAgo, extra) {
    var e = { state: state, deployAt: state ? ago(deployAgo) : null };
    for (var k in extra || {}) e[k] = extra[k];
    return e;
  }

  var PROJECTS = [
    { slug: 'reading-responses', owner: 'Instructor One', blueprint: 'node-ts-mongo@1', audience: 'large_course · synchronised', created: ago(41 * DAY), launched: true,
      envs: { sandbox: env('healthy', 2 * HOUR), staging: env('healthy', 3 * DAY + 5 * HOUR), production: env('healthy', 9 * DAY) },
      digest: FIXTURE_DIGEST, certExpires: NOW + 64 * DAY, queue: true },
    { slug: 'chem-lab-booking', owner: 'Dr. Mateo Silva', blueprint: 'node-ts-mongo@1', audience: 'class · steady', created: ago(26 * DAY), launched: false,
      envs: { sandbox: env('healthy', 1 * DAY), staging: env('healthy', 19 * HOUR + 40 * MIN), production: env(null) },
      digest: digest('chem-lab-booking'), queue: true },
    { slug: 'math-oh-queue', owner: 'Dr. Priya Raman', blueprint: 'node-ts-mongo@1', audience: 'large_course · synchronised', created: ago(58 * DAY), launched: true,
      envs: { sandbox: env('hibernated', 12 * DAY), staging: env('healthy', 15 * DAY), production: env('healthy', 15 * DAY) },
      digest: digest('math-oh-queue'), certExpires: NOW + 83 * DAY, queue: true },
    { slug: 'phys-101-labs', owner: 'Jordan Lee', blueprint: 'node-ts-mongo@1', audience: 'class · steady', created: ago(9 * DAY), launched: false,
      envs: { sandbox: env('healthy', 3 * HOUR), staging: env('healthy', 2 * DAY), production: env(null) },
      digest: digest('phys-101-labs'), fixableHigh: 1, queue: true },
    { slug: 'eng-capstone-showcase', owner: 'Dr. Nora Fitzgerald', blueprint: 'node-ts-mongo@1', audience: 'public · steady', created: ago(17 * DAY), launched: false,
      envs: { sandbox: env('healthy', 5 * HOUR), staging: env('starting', 2 * MIN), production: env(null) },
      digest: digest('eng-capstone-showcase'), queue: true },
    { slug: 'mock-app', owner: 'Instructor One', blueprint: 'node-ts-mongo@1', audience: 'class · synchronised', created: ago(9 * DAY), launched: false,
      envs: { sandbox: env(null), staging: env('healthy', 8 * DAY), production: env(null) },
      digest: FIXTURE_DIGEST, queue: true },
    { slug: 'rubric-helper', owner: 'Dr. Hana Kobayashi', blueprint: 'node-ts-mongo@0', audience: 'class · steady', created: ago(73 * DAY), launched: false,
      envs: { sandbox: env('healthy', 6 * DAY), staging: env('healthy', 6 * DAY, { incidentAt: ago(2 * HOUR + 10 * MIN) }), production: env(null) },
      digest: digest('rubric-helper'), superseded: 'node-ts-mongo@1', queue: true },
    { slug: 'lang-202-journal', owner: 'Sam Whitfield', blueprint: 'node-ts-mongo@1', audience: 'class · steady', created: ago(120 * DAY), launched: true,
      envs: { sandbox: env(null), staging: env('healthy', 30 * DAY), production: env('healthy', 30 * DAY) },
      digest: digest('lang-202-journal'), certExpires: NOW + 11 * DAY, queue: true },
    { slug: 'field-notes', owner: 'Dr. Ayesha Karim', blueprint: 'node-ts-mongo@1', audience: 'solo · steady', created: ago(33 * DAY), launched: false,
      envs: { sandbox: env('healthy', 4 * DAY, { incidentAt: ago(1 * DAY + 3 * HOUR) }), staging: env('hibernated', 20 * DAY), production: env(null) },
      digest: digest('field-notes'), queue: true },
    { slug: 'stats-sim', owner: 'Leo Park', blueprint: 'node-ts-mongo@1', audience: 'class · steady', created: ago(21 * DAY), launched: false,
      envs: { sandbox: env('healthy', 10 * DAY), staging: env('healthy', 10 * DAY), production: env(null) },
      digest: digest('stats-sim'), staleScanDays: 9, queue: true },
    { slug: 'cpsc-110-help', owner: 'Dr. Gregor Novak', blueprint: 'node-ts-mongo@1', audience: 'large_course · synchronised', created: ago(88 * DAY), launched: true,
      envs: { sandbox: env('healthy', 1 * DAY), staging: env('healthy', 6 * DAY), production: env('healthy', 6 * DAY, { exitAt: ago(2 * HOUR) }) },
      digest: digest('cpsc-110-help'), certExpires: NOW + 142 * DAY },
    { slug: 'bio-201-scheduler', owner: 'Dr. Lucia Moreno', blueprint: 'node-ts-mongo@1', audience: 'class · steady', created: ago(47 * DAY), launched: true,
      envs: { sandbox: env(null), staging: env('healthy', 12 * DAY), production: env('healthy', 12 * DAY) },
      digest: digest('bio-201-scheduler'), certExpires: NOW + 60 * DAY },
    { slug: 'hist-105-archive', owner: 'Dr. Owen Price', blueprint: 'node-ts-mongo@1', audience: 'class · steady', created: ago(30 * DAY), launched: false,
      envs: { sandbox: env(null), staging: env(null), production: env(null) },
      digest: digest('hist-105-archive'), archivedAt: ago(10 * DAY) },
    { slug: 'mus-100-listening', owner: 'Dr. Aiko Tanaka', blueprint: 'node-ts-mongo@1', audience: 'large_course · steady', created: ago(64 * DAY), launched: true,
      envs: { sandbox: env(null), staging: env('healthy', 21 * DAY), production: env('healthy', 21 * DAY) },
      digest: digest('mus-100-listening'), certExpires: NOW + 201 * DAY },
    { slug: 'geog-250-maps', owner: 'Dr. Ruth Adeyemi', blueprint: 'node-ts-mongo@1', audience: 'class · steady', created: ago(12 * DAY), launched: false,
      envs: { sandbox: env('provisioning', 1 * MIN), staging: env(null), production: env(null) },
      digest: digest('geog-250-maps') },
    { slug: 'nurs-310-sim', owner: 'Dr. Claire Dubois', blueprint: 'node-ts-mongo@1', audience: 'class · synchronised', created: ago(39 * DAY), launched: false,
      envs: { sandbox: env('healthy', 5 * DAY), staging: env('healthy', 5 * DAY), production: env(null) },
      digest: digest('nurs-310-sim') },
    { slug: 'econ-101-polls', owner: 'Dr. Samir Haddad', blueprint: 'node-ts-mongo@1', audience: 'public · synchronised', created: ago(95 * DAY), launched: true,
      envs: { sandbox: env('hibernated', 40 * DAY), staging: env('healthy', 9 * DAY), production: env('healthy', 9 * DAY, { instances: 2, of: 3, exitStoppedAt: ago(40 * MIN) }) },
      digest: digest('econ-101-polls'), certExpires: NOW + 176 * DAY },
    { slug: 'arch-studio-crits', owner: 'Dr. Mira Lindqvist', blueprint: 'node-ts-mongo@1', audience: 'solo · steady', created: ago(5 * DAY), launched: false,
      envs: { sandbox: env('healthy', 20 * HOUR), staging: env(null), production: env(null) },
      digest: digest('arch-studio-crits') }
  ];

  // Contract 1.9.0. A1: production runs its audience's count of instances (solo 1, class 2, large_course
  // and public 3); staging and sandbox run one. U1: each app's data level, as its serving release's
  // config states it (no fleet read carries it — the design's A17).
  var COUNT = { solo: 1, 'class': 2, large_course: 3, 'public': 3 };
  var LEVEL = {
    'reading-responses': 'high', 'field-notes': 'high', 'cpsc-110-help': 'high',
    'bio-201-scheduler': 'very-high', 'nurs-310-sim': 'very-high',
    'eng-capstone-showcase': 'low', 'stats-sim': 'low', 'mus-100-listening': 'low', 'geog-250-maps': 'low',
    'econ-101-polls': 'low', 'arch-studio-crits': 'low'
  };
  PROJECTS.forEach(function (p) {
    p.level = LEVEL[p.slug] || 'medium';
    ['sandbox', 'staging', 'production'].forEach(function (k) {
      var e = p.envs[k];
      // Shown where it says something: production's set. Staging and sandbox run one, always.
      if (k === 'production' && e.state && e.instances === undefined) e.instances = COUNT[p.audience.split(' · ')[0]];
    });
  });

  /* ---------------- Settings ---------------- */

  // Each value is the platform's own, read on 2026-09-27: the default quota from db/schema.ts,
  // the catalogue from infra/litellm/config.yaml, the host settings' defaults from config.ts.
  var SETTINGS = {
    quotas: [
      { id: 'max_cpu', label: 'CPU per app', value: '2', show: function (v) { return v + ' cores'; } },
      { id: 'max_memory', label: 'Memory per app', value: '2Gi', show: function (v) { return v; } },
      { id: 'max_services', label: 'Backing services per app', value: '3', show: function (v) { return v + ' services'; } },
      { id: 'ai_monthly_usd', label: 'AI spend per app', value: '50', show: function (v) { return '$' + v + ' a month'; } }
    ],
    // Cleared to UBC's U1 levels since contract 1.7.0 (confidential is very-high, internal is medium).
    models: [
      { name: 'default-chat-onprem', cleared: 'very-high', runs: 'on the host', backing: 'ollama_chat/qwen3.5:4b · thinking off' },
      { name: 'default-chat-onprem-reasoning', cleared: 'very-high', runs: 'on the host', backing: 'ollama_chat/qwen3.5:4b · thinking on' },
      { name: 'default-chat', cleared: 'medium', runs: 'on the host today; may route off-premises', backing: 'ollama_chat/qwen3.5:4b · thinking off' },
      { name: 'default-chat-reasoning', cleared: 'medium', runs: 'on the host today; may route off-premises', backing: 'ollama_chat/qwen3.5:4b · thinking on' },
      { name: 'default-embed', cleared: 'medium', runs: 'on the host', backing: 'ollama/nomic-embed-text' }
    ],
    blueprints: [
      { ref: 'node-ts-mongo@1', state: 'current', language: 'TypeScript on Node', starters: ['proof-app'], apps: 17 },
      { ref: 'node-ts-mongo@0', state: 'superseded', language: 'TypeScript on Node', starters: ['proof-app'], apps: 1 }
    ],
    vulnDbBuilt: Date.UTC(2026, 8, 24, 6, 31, 52),
    admins: [
      { name: 'Rich Tape', since: Date.UTC(2026, 8, 17, 16, 5), by: 'bootstrap:rich@ops-laptop', reason: 'The first administrator.' },
      { name: 'Alex Chen', since: Date.UTC(2026, 8, 22, 18, 40), by: 'Rich Tape', reason: 'Second pair of hands for launch approvals and the external track.' }
    ]
  };

  /* ---------------- the queue ---------------- */

  var RR_DIFF = {
    imageDigest: digest('reading-responses-r7'),
    baselineReleaseId: uuid('reading-responses-r6'),
    sensitiveFields: ['egress.allow', 'ai.models'],
    changes: [
      { path: 'egress.allow', from: '[]', to: '[api.crossref.org]' },
      { path: 'ai.models', from: '[default-chat-onprem]', to: '[default-chat-onprem, default-chat]' },
      { path: 'env.CROSSREF_MAILTO', from: '(not declared)', to: 'secret: false' }
    ],
    security: [
      { field: 'egress.allow', note: NOTES['egress.allow'] },
      { field: 'ai.models', note: NOTES['ai.models'] }
    ],
    summary: 'The app can now look up citations on Crossref, sending each reference a student pastes to api.crossref.org, and can ask default-chat as well as default-chat-onprem.',
    summarySource: 'llm',
    summaryExposures: [
      { path: 'egress.allow', sentence: 'References students paste — titles, authors, sometimes a DOI — would leave UBC for a service outside Canada.' },
      { path: 'ai.models', sentence: 'Student responses could now reach default-chat, which is cleared only for internal data and may be routed off-premises.' },
      { path: 'env.CROSSREF_MAILTO', sentence: 'A contact address is sent to Crossref with every lookup; it identifies the course, not a student.' }
    ],
    services: ['mongodb@7.0'],
    attributes: ['givenName', 'mail', 'ubcEduCwlPuid'],
    resources: { cpu: 1, memory: '512Mi', disk: '1Gi', pids: 64 },
    review: REVIEW, coverage: COVERAGE
  };

  var CHEM_DIFF = {
    imageDigest: digest('chem-lab-booking'),
    baselineReleaseId: null, sensitiveFields: [], changes: [], security: [],
    summary: null, summarySource: 'no-previous-release', summaryExposures: null,
    services: ['mongodb@7.0'],
    attributes: ['givenName', 'mail', 'sn', 'ubcEduCwlPuid'],
    resources: { cpu: 1, memory: '256Mi', disk: '1Gi', pids: 64 },
    review: REVIEW, coverage: COVERAGE
  };

  function checklist(overrides) {
    var base = [
      { id: 'domain', title: 'Where the app will live', state: 'met' },
      { id: 'iam-registration', title: 'Registered with UBC IAM', state: 'met' },
      { id: 'privacy-assessment', title: 'Privacy Impact Assessment approved', state: 'met' },
      { id: 'rehearsal', title: 'Pre-production rehearsal passed', state: 'met' },
      { id: 'scans', title: 'Dependency and secret scans clean', state: 'met' },
      { id: 'admin-approval', title: 'Release approved by a platform administrator', state: 'unmet' },
      { id: 'code-review', title: 'Code reviewed for safety', state: 'not_built', why: 'Not blocking (D33).' }
    ];
    return base.map(function (i) { var o = overrides && overrides[i.id]; if (!o) return i; var c = {}; for (var k in i) c[k] = i[k]; for (var j in o) c[j] = o[j]; return c; });
  }

  // Contract 1.9.0's listQueue: seven kinds, each with `since` (when it was asked, or sent) — so nothing
  // is "up to" any more. A record its owner is still drafting is not in the queue, nor is an agent's
  // question (its minter decides it: it is on the app's page). Domains, audience upgrades and launch
  // overrides are still drawn, and still not modelled (A4).
  var QUEUE = [
    {
      id: 'q-rr', kind: 'approval', band: 'us', project: 'reading-responses', owner: 'Instructor One',
      askedAt: ago(3 * DAY + 4 * HOUR),
      kindLabel: 'Release approval', ask: 'Approve a release that widens egress and adds a model',
      note: 'The class starts on Monday, and the Crossref lookup is the only new thing. Mathematics IT has looked at the egress change already.',
      meta: [{ text: 'Instructor One asked' }, { text: 'egress.allow · ai.models', mono: true }, { text: '2 sensitive fields', flag: true }, { text: '✎ a note', flag: true }],
      release: { id: uuid('reading-responses-r7'), digest: RR_DIFF.imageDigest, madeBy: 'Instructor One', madeAgo: 3 * DAY + 6 * HOUR, scan: SCAN, launched: true },
      checklist: checklist({ 'admin-approval': { why: 'Re-escalated: egress.allow and ai.models changed since the last approved release (D9.2).' } }),
      diff: RR_DIFF,
      events: [
        { at: ago(3 * DAY + 4 * HOUR), type: 'approval.requested', who: 'Instructor One', text: 'Instructor One asked an administrator to approve this release for production.' },
        { at: ago(3 * DAY + 5 * HOUR), type: 'instance.healthy', text: 'reading-responses is running in staging.' },
        { at: ago(3 * DAY + 5 * HOUR + 2 * MIN), type: 'instance.starting', text: 'reading-responses is starting in staging.' },
        { at: ago(3 * DAY + 6 * HOUR), type: 'build.succeeded', text: 'reading-responses was built.' },
        { at: ago(3 * DAY + 6 * HOUR + 5 * MIN), type: 'repository.committed', who: 'Instructor One', text: 'Instructor One’s agent (token ‘the agent that builds this app’) committed 3 changes to main: Look up citations with Crossref' }
      ]
    },
    {
      id: 'q-domain', kind: 'domain', band: 'us', project: 'math-oh-queue', owner: 'Dr. Priya Raman',
      askedAt: ago(2 * DAY + 7 * HOUR), kindGap: 'A4',
      kindLabel: 'Domain to attach', ask: 'Attach queue.math.ubc.ca',
      meta: [{ text: 'Dr. Priya Raman asked' }, { text: 'verified by DNS 2 days ago' }, { text: 'needs an IAM change request', flag: true }],
      facts: [
        { label: 'Domain', value: 'queue.math.ubc.ca', mono: true },
        { label: 'Verified', value: 'TXT _manifest-challenge.queue.math.ubc.ca found, 2 days ago', mono: true },
        { label: 'Points at', value: 'CNAME → math-oh-queue.manifest.internal', mono: true },
        { label: 'Certificate', value: 'Issued when you attach it' },
        { label: 'IAM registration', value: 'Names math-oh-queue.manifest.internal. Attaching the domain to a CWL app needs a change request to UBC IAM (§23, §9).' }
      ],
      changes: 'Students reach the app at queue.math.ubc.ca. math-oh-queue.manifest.internal keeps answering: a canonical hostname is permanent (D26).',
      quote: 'Students have been told to go to queue.math.ubc.ca since 2024. Mathematics IT has the CNAME in place.',
      actions: ['Attach', 'Decline'],
      preview: { type: 'domain.attached', lead: 'Rich Tape attached queue.math.ubc.ca to math-oh-queue:', gap: 'A4' }
    },
    {
      id: 'q-iam-team', kind: 'team', recordKind: 'iam', band: 'us', project: 'phys-101-labs', owner: 'Jordan Lee',
      askedAt: ago(1 * DAY + 2 * HOUR),
      kindLabel: 'Registration to submit', ask: 'Submit the production registration to UBC IAM, or hand it back',
      meta: [{ text: 'Jordan Lee sent it to the Manifest team' }, { text: 'production · sent', mono: true }],
      record: {
        state: 'sent', sentFrom: 'draft', environment: 'production', sentBy: 'Jordan Lee',
        entityId: 'https://manifest.internal/sp/phys-101-labs/production',
        acsUrl: 'https://phys-101-labs.manifest.internal/auth/callback', sloUrl: 'https://phys-101-labs.manifest.internal/auth/logout',
        cert: { fingerprint: '4F:A1:09:7C:22:D8:3B:61:0E:95:C4:7A:18:B2:6D:F0:33:8E:C1:5A', expires: NOW + 730 * DAY },
        attributes: [
          { name: 'ubcEduCwlPuid', purpose: 'Who the student is, across sessions', used: 'src/auth/session.ts:41' },
          { name: 'givenName', purpose: 'The greeting on the lab page', used: 'src/views/lab.ts:12' },
          { name: 'mail', purpose: 'Where a lab’s feedback is sent', used: 'src/feedback/notify.ts:28' },
          { name: 'sn', purpose: 'Asked for in manifest.yaml', used: null }
        ],
        warnings: ['sn is asked for and never read by the code. UBC IAM may ask why.']
      },
      ticketLabel: 'UBC IAM ticket', ticketPlaceholder: 'IAM-2026-0612', to: 'UBC IAM',
      submitLead: 'Rich Tape recorded that the Manifest team submitted this app’s production registration to UBC IAM on {day} (ticket {ticket}).',
      returnLead: 'Rich Tape handed this app’s production registration back to its owner, unsubmitted.',
      afterSubmit: { kindLabel: 'IAM registration', holder: 'UBC IAM', ask: 'Record UBC IAM’s answer when it comes' }
    },
    {
      id: 'q-change-team', kind: 'team', recordKind: 'iam', change: true, band: 'us', project: 'bio-201-scheduler', owner: 'Dr. Lucia Moreno',
      askedAt: ago(1 * DAY + 6 * HOUR),
      kindLabel: 'Change to file', ask: 'File a change request with UBC IAM, or hand it back',
      meta: [{ text: 'Dr. Lucia Moreno sent it to the Manifest team' }, { text: '+ sn', mono: true }, { text: 'a live registration', flag: true }],
      record: {
        state: 'sent', sentFrom: 'active', environment: 'production', sentBy: 'Dr. Lucia Moreno',
        entityId: 'https://manifest.internal/sp/bio-201-scheduler/production',
        acsUrl: 'https://bio-201-scheduler.manifest.internal/auth/callback', sloUrl: 'https://bio-201-scheduler.manifest.internal/auth/logout',
        registered: ['ubcEduCwlPuid', 'givenName', 'mail'], requested: ['ubcEduCwlPuid', 'givenName', 'mail', 'sn'],
        ticket: 'IAM-2026-0388', warnings: []
      },
      ticketLabel: 'UBC IAM ticket for the change', ticketPlaceholder: 'IAM-2026-0630', to: 'UBC IAM',
      submitLead: 'Rich Tape recorded that the Manifest team filed a change request for this app’s production registration with UBC IAM on {day} (ticket {ticket}).',
      returnLead: 'Rich Tape handed this app’s production registration back to its owner, unsubmitted.',
      afterSubmit: { kindLabel: 'IAM change request', holder: 'UBC IAM', ask: 'Record UBC IAM’s answer to the change' }
    },
    {
      id: 'q-chem', kind: 'approval', band: 'us', project: 'chem-lab-booking', owner: 'Dr. Mateo Silva',
      askedAt: ago(19 * HOUR + 40 * MIN),
      kindLabel: 'Release approval', ask: 'Approve the first production launch',
      meta: [{ text: 'Dr. Mateo Silva asked' }, { text: 'first launch', flag: true }, { text: 'every other item met' }],
      release: { id: uuid('chem-lab-booking-r3'), digest: CHEM_DIFF.imageDigest, madeBy: 'Dr. Mateo Silva', madeAgo: 20 * HOUR, scan: 'grype v0.118.0 · database 3 days old · introduced: nothing fixable · base image: 4 critical, 14 high', launched: false },
      checklist: checklist({ 'admin-approval': { why: 'Every other blocking item is met. This is the last one.' } }),
      diff: CHEM_DIFF,
      events: [
        { at: ago(19 * HOUR + 40 * MIN), type: 'approval.requested', who: 'Dr. Mateo Silva', text: 'Dr. Mateo Silva asked an administrator to approve this release for production.' },
        { at: ago(20 * HOUR), type: 'rehearsal.completed', who: 'Dr. Mateo Silva', text: 'Dr. Mateo Silva ran the pre-production rehearsal and it passed.' },
        { at: ago(2 * DAY), type: 'privacy_assessment.recorded', who: 'Alex Chen', text: 'Alex Chen recorded this app’s privacy assessment as approved (ticket PIA-2026-0102).' },
        { at: ago(6 * DAY), type: 'iam_registration.recorded', who: 'Alex Chen', text: 'Alex Chen recorded this app’s production UBC IAM registration as active (ticket IAM-2026-0471).' }
      ]
    },
    {
      id: 'q-audience', kind: 'audience', band: 'us', project: 'phys-101-labs', owner: 'Jordan Lee',
      askedAt: ago(11 * HOUR + 15 * MIN), kindGap: 'A4',
      kindLabel: 'Audience upgrade', ask: 'Make it a large course that arrives all at once',
      meta: [{ text: 'Jordan Lee asked' }, { text: 'class · steady → large_course · synchronised', mono: true }],
      facts: [
        { label: 'Now', value: 'class · steady', mono: true },
        { label: 'Asked for', value: 'large_course · synchronised', mono: true },
        { label: 'Set by', value: 'Jordan Lee, at creation, 9 days ago' }
      ],
      changes: 'Production goes from two instances to three, and the launch checklist gains a load rehearsal (§24).',
      quote: 'PHYS 101 runs 14 lab sections that all start at 9:00 on Mondays. About 740 students sign in within ten minutes.',
      actions: ['Grant', 'Decline'],
      preview: { type: 'audience.changed', lead: 'Rich Tape changed who this app is for to a large course arriving together:', gap: 'A4' }
    },
    {
      id: 'q-pia-team', kind: 'team', recordKind: 'pia', band: 'us', project: 'rubric-helper', owner: 'Dr. Hana Kobayashi',
      askedAt: ago(5 * HOUR),
      kindLabel: 'Assessment to submit', ask: 'Submit the privacy assessment to the Privacy Office, or hand it back',
      meta: [{ text: 'Dr. Hana Kobayashi sent it to the Manifest team' }, { text: 'every gap answered' }],
      record: {
        state: 'sent', sentFrom: 'draft', sentBy: 'Dr. Hana Kobayashi',
        sections: [
          { title: 'What it collects', facts: ['Each student’s CWL identifier and name', 'Rubric scores and the instructor’s comments'],
            gaps: [{ id: 'collected-purpose', text: 'Why is each item needed?', answer: 'The identifier ties a score to a student; the name is shown to the TA marking it. Nothing else is kept.' }] },
          { title: 'How long it is kept', facts: ['MongoDB, on UBC infrastructure'],
            gaps: [{ id: 'retention', text: 'When is it deleted?', answer: 'At the end of the term the course archives the app and its data is removed with it.' }] }
        ],
        warnings: []
      },
      ticketLabel: 'PRISM reference', ticketPlaceholder: 'PIA-2026-0140', to: 'the Privacy Office',
      submitLead: 'Rich Tape recorded that the Manifest team submitted this app’s privacy assessment to the UBC Privacy Office on {day} (ticket {ticket}).',
      returnLead: 'Rich Tape handed this app’s privacy assessment back to its owner, unsubmitted.',
      afterSubmit: { kindLabel: 'Privacy assessment', holder: 'the Privacy Office', ask: 'Record the Privacy Office’s answer when it comes' }
    },
    {
      id: 'q-override', kind: 'override', band: 'us', project: 'eng-capstone-showcase', owner: 'Dr. Nora Fitzgerald',
      askedAt: ago(3 * HOUR + 20 * MIN), kindGap: 'A4',
      kindLabel: 'Launch override', ask: 'Launch without a load rehearsal',
      meta: [{ text: 'Dr. Nora Fitzgerald asked' }, { text: 'load-rehearsal', mono: true }, { text: 'unmet', mono: true }],
      facts: [
        { label: 'Checklist item', value: 'load-rehearsal · blocking · unmet', mono: true },
        { label: 'Why it is there', value: 'The audience is public, which adds a load rehearsal (§24). From contract 1.10.0 the owner can run one; this asks to launch without it.' },
        { label: 'Audience', value: 'public · steady', mono: true }
      ],
      changes: 'The checklist records load-rehearsal as overridden by you, with your reason. Nothing is rehearsed.',
      quote: 'It is a public showcase for one evening, 7 to 9pm on 9 October. We expect fewer than 150 visitors.',
      actions: ['Record the override', 'Decline'],
      preview: { type: 'launch.item_overridden', lead: 'Rich Tape overrode “load-rehearsal” for this launch:', gap: 'A4' }
    },

    /* waiting on UBC — ours to chase, and to record when it answers */
    {
      id: 'q-pia-sub', kind: 'pia', band: 'else', project: 'field-notes', owner: 'Dr. Ayesha Karim', holder: 'the Privacy Office',
      askedAt: ago(23 * DAY + 4 * HOUR),
      kindLabel: 'Privacy assessment', ask: 'Record the Privacy Office’s answer when it comes',
      meta: [{ text: 'With the Privacy Office', holder: true }, { text: 'submitted', mono: true }, { text: 'PIA-2026-0118', mono: true }, { text: 'submitted by Alex Chen' }],
      record: { state: 'submitted', reviewer: 'UBC Privacy Office', ticket: 'PIA-2026-0118', submittedBy: 'Alex Chen' },
      next: [
        { value: 'approved', title: 'Approved', note: 'The Privacy Office approved it. The launch checklist’s item becomes met.' },
        { value: 'draft', title: 'Back to draft', note: 'The Privacy Office refused it. There is no rejected state: it returns to draft for its owner.' }
      ],
      ticketLabel: 'Privacy Office reference', ticketPlaceholder: 'PIA-2026-0118', reviewer: true,
      preview: { type: 'privacy_assessment.recorded', lead: 'Rich Tape recorded this app’s privacy assessment as {state} (ticket {ticket}).' }
    },
    {
      id: 'q-iam-sub', kind: 'iam', band: 'else', project: 'stats-sim', owner: 'Leo Park', holder: 'UBC IAM',
      askedAt: ago(4 * DAY + 2 * HOUR),
      kindLabel: 'IAM registration', ask: 'Record UBC IAM’s answer when it comes',
      meta: [{ text: 'With UBC IAM', holder: true }, { text: 'staging · submitted', mono: true }, { text: 'IAM-2026-0511', mono: true }],
      record: {
        state: 'submitted', environment: 'staging', entityId: 'https://manifest.internal/sp/stats-sim/staging',
        acsUrl: 'https://stats-sim.staging.manifest.internal/auth/callback', sloUrl: 'https://stats-sim.staging.manifest.internal/auth/logout',
        attributes: ['givenName', 'mail', 'ubcEduCwlPuid'], ticket: 'IAM-2026-0511', submittedBy: 'Alex Chen'
      },
      next: [
        { value: 'active', title: 'Active', note: 'UBC IAM registered it. Record exactly what their ticket lists: the attributes, the certificate and its expiry.' },
        { value: 'change_requested', title: 'Sent back with questions', note: 'UBC IAM has questions for the owner. It leaves this queue: answering them is the owner’s.' }
      ],
      ticketLabel: 'UBC IAM ticket', ticketPlaceholder: 'IAM-2026-0511', cert: true,
      preview: { type: 'iam_registration.recorded', lead: 'Rich Tape recorded this app’s staging UBC IAM registration as {state} (ticket {ticket}).' }
    },
    {
      id: 'q-iam-cr', kind: 'iam', band: 'else', project: 'lang-202-journal', owner: 'Sam Whitfield', holder: 'UBC IAM',
      askedAt: ago(21 * DAY + 6 * HOUR),
      kindLabel: 'IAM change request', ask: 'Record UBC IAM’s answer to the change',
      meta: [{ text: 'With UBC IAM', holder: true }, { text: 'change_requested', mono: true }, { text: '+ eduPersonAffiliation', mono: true }],
      record: {
        state: 'change_requested', changeRequestedFrom: 'active', environment: 'production', entityId: 'https://manifest.internal/sp/lang-202-journal/production',
        acsUrl: 'https://lang-202-journal.manifest.internal/auth/callback', sloUrl: 'https://lang-202-journal.manifest.internal/auth/logout',
        attributes: ['givenName', 'mail', 'ubcEduCwlPuid'], requested: ['givenName', 'mail', 'ubcEduCwlPuid', 'eduPersonAffiliation'], ticket: 'IAM-2026-0377', submittedBy: 'Alex Chen'
      },
      // The platform's arrows out of change_requested are submitted and expired (launch/transitions.ts):
      // recording that UBC granted a filed change is two writes, submitted then active (the design's A20).
      next: [
        { value: 'submitted', title: 'Answered: with UBC IAM again', note: 'The only arrow toward active from here. A granted change is recorded as submitted, then active.', gap: 'A20' },
        { value: 'expired', title: 'Expired', note: 'The registration lapsed while the change waited.' }
      ],
      ticketLabel: 'UBC IAM ticket', ticketPlaceholder: 'IAM-2026-0377',
      preview: { type: 'iam_registration.recorded', lead: 'Rich Tape recorded this app’s production UBC IAM registration as {state} (ticket {ticket}).' }
    }
  ];

  // An agent's question is decided by the person who minted its token (§26), so it is not in the
  // queue: it is on the app's page, where an administrator can only refuse it, with a reason.
  var AGENT_QUESTIONS = {
    'bio-201-scheduler': {
      id: 'aq-bio', owner: 'Dr. Lucia Moreno', askedAt: ago(3 * HOUR), expiresAt: NOW + 21 * HOUR,
      action: {
        capability: 'members:manage', method: 'POST', path: '/v1/projects/' + uuid('bio-201-scheduler') + '/members',
        bodySha256: '0aa6131a7f3b5c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f', summary: 'add Sam Helper to this project as a collaborator'
      },
      token: { name: 'the agent that builds this app', capabilities: ['project:read', 'build:create', 'release:deploy'], rateLimit: 600, lastUsed: '3 hours ago', expires: '18 December 2026', mintedBy: 'Dr. Lucia Moreno' },
      lead: 'Rich Tape refused an agent’s request to add Sam Helper to this project as a collaborator:'
    }
  };

  // Events a platform administrator signed — contract 1.9.0's EventActor: asAdministrator and its reason.
  var ADMIN_EVENTS = {
    'bio-201-scheduler': [
      { at: ago(2 * DAY + 3 * HOUR), type: 'project.renamed', who: 'Alex Chen', asAdmin: true,
        reason: 'The course code changed this term; the department asked.',
        text: 'Alex Chen renamed the project from “Bio 201 lab scheduler” to “Bio 201 scheduler”.' }
    ]
  };

  /* ---------------- Health ---------------- */

  // Contract 1.9.0's listIncidents, each with its cause: `deploy` (a deploy that never answered; what
  // served before keeps serving), `exit` (a serving instance stopped and was replaced) or `exit_stopped`
  // (it stopped, and replacing it gave up — production is short of its count until someone acts).
  var INCIDENTS = [
    { project: 'econ-101-polls', env: 'production', at: ago(40 * MIN), cause: 'exit_stopped',
      exitReason: 'exited with code 1, three times this hour', failedCheck: 'container state from the Docker driver',
      diffSinceHealthy: 'none: the release that serves is the one that stopped', logTail: 'MongoServerSelectionError: connection timed out',
      serving: 'on 2 of its 3 instances',
      sentence: 'An instance of econ-101-polls\'s production stopped again; replacing it has stopped after three tries this hour. The app is serving on the rest of its set.' },
    { project: 'cpsc-110-help', env: 'production', at: ago(2 * HOUR), cause: 'exit',
      exitReason: 'exited with code 137: out of memory at 512Mi', failedCheck: 'container state from the Docker driver',
      diffSinceHealthy: 'none: the release that serves is the one that stopped', logTail: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      serving: 'on all 3 instances again',
      sentence: 'An instance of cpsc-110-help\'s production stopped; it is being replaced. The app kept serving on the rest of its set.' },
    { project: 'rubric-helper', env: 'staging', at: ago(2 * HOUR + 10 * MIN), cause: 'deploy',
      exitReason: 'the readiness probe never answered 200', failedCheck: 'GET /healthz from inside the edge',
      diffSinceHealthy: 'runtime.health: /healthz → /never-ready', logTail: 'Error: connect ECONNREFUSED 127.0.0.1:27017',
      serving: 'the release from 6 days ago' },
    { project: 'field-notes', env: 'sandbox', at: ago(1 * DAY + 3 * HOUR), cause: 'deploy',
      exitReason: 'exited with code 137: out of memory at 256Mi', failedCheck: 'container state from the Docker driver',
      diffSinceHealthy: 'services.0: + redis@7 (declared, not bound)', logTail: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      serving: 'the release from 4 days ago' }
  ];

  // What contract 1.9.0 still cannot answer (the design document's §10, refreshed 2026-10-14). A2 and A3 are
  // closed (listQueue; requestApproval and the records' sentAt/submittedAt), and A6 is settled by §26.
  var GAPS = [
    ['A1', 'Revoking a token writes no event of its own; everything else an administrator does is recorded with an actor, and their reason where §26 asks one.'],
    ['A4', 'Domains, audience upgrades and launch overrides are not modelled at all.'],
    ['A5', 'Events carry their actor now, but there is no read across projects and no filter: Audit has nothing beneath it.'],
    ['A7', 'The fleet is unpaginated and has no launchedAt, department, domains or spend.'],
    ['A8', 'A release names its author, and a token its minter, only by id.'],
    ['A9', 'Incidents carry their cause, but have no open or closed state.'],
    ['A10', 'People has no read.'],
    ['A11', 'Spend has no read.'],
    ['A12', 'A driver’s unenforceable policies and custom-domain certificates have no read.'],
    ['A13', 'Settings has no read or write: quota:set is held by administrators and used by no route; the catalogue is a config file; host settings are environment variables.'],
    ['A14', 'An administrator cannot revoke someone else’s token: only its minter may.'],
    ['A15', 'The queue’s oldestSince counts waits UBC holds; the headline is computed from our band instead.'],
    ['A16', 'Agents’ questions have no read across projects.'],
    ['A17', 'The fleet carries no data level: it is per release.'],
    ['A18', 'Nothing says which project holds the one load rehearsal slot (contract 1.10.0).'],
    ['A19', 'A hand-back keeps no reason.'],
    ['A20', 'From a change request the arrows are submitted and expired: a granted change is two writes.']
  ];

  global.ADMIN_DATA = {
    NOW: NOW, MIN: MIN, HOUR: HOUR, DAY: DAY,
    admin: 'Rich Tape', projects: PROJECTS, queue: QUEUE, incidents: INCIDENTS, gaps: GAPS,
    agentQuestions: AGENT_QUESTIONS, adminEvents: ADMIN_EVENTS,
    settings: SETTINGS, healthReads: 1 + 4 * PROJECTS.length
  };
})(window);
