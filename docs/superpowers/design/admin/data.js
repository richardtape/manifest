/* The mockup's data. Shapes and platform wording are read from the published contract
 * (v1.3.0), manifest-mock's fixtures and the control plane's event publishers; the projects,
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
      digest: digest('stats-sim'), staleScanDays: 9, queue: true }
  ];

  /* ---------------- the queue ---------------- */

  var RR_DIFF = {
    imageDigest: digest('reading-responses-r7'),
    baselineReleaseId: uuid('reading-responses-r6'),
    sensitiveFields: ['egress.allow', 'ai.models'],
    changes: [
      { path: 'egress.allow', from: '[]', to: '[api.crossref.org]' },
      { path: 'ai.models', from: '[llama3.1-8b]', to: '[llama3.1-8b, qwen3.5-4b]' },
      { path: 'env.CROSSREF_MAILTO', from: '(not declared)', to: 'secret: false' }
    ],
    security: [
      { field: 'egress.allow', note: NOTES['egress.allow'] },
      { field: 'ai.models', note: NOTES['ai.models'] }
    ],
    summary: 'The app can now look up citations on Crossref, sending each reference a student pastes to api.crossref.org, and can ask a second model on the platform’s catalogue.',
    summarySource: 'llm',
    summaryExposures: [
      { path: 'egress.allow', sentence: 'References students paste — titles, authors, sometimes a DOI — would leave UBC for a service outside Canada.' },
      { path: 'ai.models', sentence: 'Student responses could now be sent to a second model; whether it runs in the same place as the first is the question the PIA answered.' },
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

  var QUEUE = [
    {
      id: 'q-rr', kind: 'approval', band: 'us', project: 'reading-responses', owner: 'Instructor One',
      askedAt: ago(3 * DAY + 5 * HOUR), bound: true,
      kindLabel: 'Release approval', ask: 'Approve a release that widens egress and adds a model',
      meta: [{ text: 'Instructor One made it' , gap: 'A8' }, { text: 'egress.allow · ai.models', mono: true }, { text: '2 sensitive fields', flag: true }],
      release: { id: uuid('reading-responses-r7'), digest: RR_DIFF.imageDigest, madeBy: 'Instructor One', madeAgo: 3 * DAY + 6 * HOUR, scan: SCAN, launched: true },
      checklist: checklist({ 'admin-approval': { why: 'Re-escalated: egress.allow and ai.models changed since the last approved release (D9.2).' } }),
      diff: RR_DIFF,
      events: [
        { at: ago(3 * DAY + 5 * HOUR), type: 'instance.healthy', text: 'reading-responses is running in staging.' },
        { at: ago(3 * DAY + 5 * HOUR + 2 * MIN), type: 'instance.starting', text: 'reading-responses is starting in staging.' },
        { at: ago(3 * DAY + 5 * HOUR + 3 * MIN), type: 'instance.provisioning', text: 'Preparing reading-responses in staging.' },
        { at: ago(3 * DAY + 6 * HOUR), type: 'build.succeeded', text: 'reading-responses was built.' },
        { at: ago(3 * DAY + 6 * HOUR + 4 * MIN), type: 'build.started', text: 'Building reading-responses at commit 7f3a9c1.' },
        { at: ago(3 * DAY + 6 * HOUR + 5 * MIN), type: 'repository.committed', text: 'Instructor One’s agent (token ‘the agent that builds this app’) committed 3 changes to main: Look up citations with Crossref' }
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
      id: 'q-iam-draft', kind: 'iam', band: 'us', project: 'phys-101-labs', owner: 'Jordan Lee',
      askedAt: ago(1 * DAY + 2 * HOUR), ageGap: 'A3',
      kindLabel: 'IAM registration', ask: 'Submit the production registration to UBC IAM',
      meta: [{ text: 'for Jordan Lee' }, { text: 'draft', mono: true }, { text: 'age from its last change', gap: 'A3' }],
      record: {
        state: 'draft', entityId: 'https://manifest.internal/sp/phys-101-labs/production',
        acsUrl: 'https://phys-101-labs.manifest.internal/auth/callback', sloUrl: 'https://phys-101-labs.manifest.internal/auth/logout',
        attributes: ['givenName', 'mail', 'sn', 'ubcEduCwlPuid'], ticket: null
      },
      next: [{ value: 'submitted', title: 'Submitted to UBC IAM', note: 'You sent the registration package. It can become active only when UBC IAM confirms it.' }],
      ticketLabel: 'UBC IAM ticket', ticketPlaceholder: 'RITM0000000',
      preview: { type: 'iam_registration.recorded', lead: 'Rich Tape recorded this app’s UBC IAM registration as submitted (ticket {ticket}).' }
    },
    {
      id: 'q-chem', kind: 'approval', band: 'us', project: 'chem-lab-booking', owner: 'Dr. Mateo Silva',
      askedAt: ago(19 * HOUR + 40 * MIN), bound: true,
      kindLabel: 'Release approval', ask: 'Approve the first production launch',
      meta: [{ text: 'Dr. Mateo Silva made it', gap: 'A8' }, { text: 'first launch', flag: true }, { text: 'every other item met' }],
      release: { id: uuid('chem-lab-booking-r3'), digest: CHEM_DIFF.imageDigest, madeBy: 'Dr. Mateo Silva', madeAgo: 20 * HOUR, scan: 'grype v0.118.0 · database 3 days old · introduced: nothing fixable · base image: 4 critical, 14 high', launched: false },
      checklist: checklist({ 'admin-approval': { why: 'Every other blocking item is met. This is the last one.' } }),
      diff: CHEM_DIFF,
      events: [
        { at: ago(19 * HOUR + 40 * MIN), type: 'rehearsal.completed', text: 'Dr. Mateo Silva ran the pre-production rehearsal and it passed.' },
        { at: ago(2 * DAY), type: 'privacy_assessment.recorded', text: 'Alex Chen recorded this app’s privacy assessment as approved (ticket PIA-2026-0102).' },
        { at: ago(6 * DAY), type: 'iam_registration.recorded', text: 'Alex Chen recorded this app’s UBC IAM registration as active (ticket RITM0047115).' }
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
      changes: 'Adds a load rehearsal to the launch checklist, and production pre-warms before a synchronised start (§24).',
      quote: 'PHYS 101 runs 14 lab sections that all start at 9:00 on Mondays. About 740 students sign in within ten minutes.',
      actions: ['Grant', 'Decline'],
      preview: { type: 'audience.changed', lead: 'Rich Tape changed who this app is for to a large course arriving together:', gap: 'A4' }
    },
    {
      id: 'q-override', kind: 'override', band: 'us', project: 'eng-capstone-showcase', owner: 'Dr. Nora Fitzgerald',
      askedAt: ago(3 * HOUR + 20 * MIN), kindGap: 'A4',
      kindLabel: 'Launch override', ask: 'Launch without a load rehearsal',
      meta: [{ text: 'Dr. Nora Fitzgerald asked' }, { text: 'load-rehearsal', mono: true }, { text: 'not_built', mono: true }],
      facts: [
        { label: 'Checklist item', value: 'load-rehearsal · blocking · not_built', mono: true },
        { label: 'Why it is there', value: 'The audience is public, which adds a load rehearsal (§24). Manifest cannot run one yet.' },
        { label: 'Audience', value: 'public · steady', mono: true }
      ],
      changes: 'The checklist records load-rehearsal as overridden by you, with your reason. Nothing is rehearsed.',
      quote: 'It is a public showcase for one evening, 7 to 9pm on 9 October. We expect fewer than 150 visitors.',
      actions: ['Record the override', 'Decline'],
      preview: { type: 'launch.item_overridden', lead: 'Rich Tape overrode “load-rehearsal” for this launch:', gap: 'A4' }
    },

    /* waiting on someone else */
    {
      id: 'q-pia-sub', kind: 'pia', band: 'else', project: 'field-notes', owner: 'Dr. Ayesha Karim', holder: 'UBC Privacy Office',
      askedAt: ago(23 * DAY + 4 * HOUR), ageGap: 'A3',
      kindLabel: 'Privacy assessment', ask: 'Chase the Privacy Office',
      meta: [{ text: 'Held by UBC Privacy Office', holder: true }, { text: 'submitted', mono: true }, { text: 'PIA-2026-0118', mono: true }],
      record: { state: 'submitted', reviewer: 'UBC Privacy Office', ticket: 'PIA-2026-0118' },
      next: [
        { value: 'approved', title: 'Approved', note: 'The Privacy Office approved it. The launch checklist’s item becomes met.' },
        { value: 'draft', title: 'Back to draft', note: 'The Privacy Office refused it. There is no rejected state: it returns to draft with their note.' }
      ],
      ticketLabel: 'Privacy Office reference', ticketPlaceholder: 'PIA-2026-0118', reviewer: true,
      preview: { type: 'privacy_assessment.recorded', lead: 'Rich Tape recorded this app’s privacy assessment as {state} (ticket {ticket}).' }
    },
    {
      id: 'q-iam-sub', kind: 'iam', band: 'else', project: 'stats-sim', owner: 'Leo Park', holder: 'UBC IAM',
      askedAt: ago(16 * DAY + 2 * HOUR), ageGap: 'A3',
      kindLabel: 'IAM registration', ask: 'Chase UBC IAM',
      meta: [{ text: 'Held by UBC IAM', holder: true }, { text: 'submitted', mono: true }, { text: 'RITM0048812', mono: true }],
      record: {
        state: 'submitted', entityId: 'https://manifest.internal/sp/stats-sim/production',
        acsUrl: 'https://stats-sim.manifest.internal/auth/callback', sloUrl: 'https://stats-sim.manifest.internal/auth/logout',
        attributes: ['givenName', 'mail', 'ubcEduCwlPuid'], ticket: 'RITM0048812'
      },
      next: [{ value: 'active', title: 'Active', note: 'UBC IAM registered it. Record exactly what their ticket lists: the attributes, the certificate and its expiry.' }],
      ticketLabel: 'UBC IAM ticket', ticketPlaceholder: 'RITM0048812', cert: true,
      preview: { type: 'iam_registration.recorded', lead: 'Rich Tape recorded this app’s UBC IAM registration as active (ticket {ticket}).' }
    },
    {
      id: 'q-iam-cr', kind: 'iam', band: 'else', project: 'lang-202-journal', owner: 'Sam Whitfield', holder: 'UBC IAM',
      askedAt: ago(2 * DAY + 6 * HOUR), ageGap: 'A3',
      kindLabel: 'IAM change request', ask: 'Chase UBC IAM for one more attribute',
      meta: [{ text: 'Held by UBC IAM', holder: true }, { text: 'change_requested', mono: true }, { text: '+ eduPersonAffiliation', mono: true }],
      record: {
        state: 'change_requested', entityId: 'https://manifest.internal/sp/lang-202-journal/production',
        acsUrl: 'https://lang-202-journal.manifest.internal/auth/callback', sloUrl: 'https://lang-202-journal.manifest.internal/auth/logout',
        attributes: ['givenName', 'mail', 'ubcEduCwlPuid'], requested: ['givenName', 'mail', 'ubcEduCwlPuid', 'eduPersonAffiliation'], ticket: 'RITM0049320'
      },
      next: [{ value: 'active', title: 'Active', note: 'UBC IAM made the change. The registered attributes become the requested ones.' }],
      ticketLabel: 'UBC IAM ticket', ticketPlaceholder: 'RITM0049320',
      preview: { type: 'iam_registration.recorded', lead: 'Rich Tape recorded this app’s UBC IAM registration as active (ticket {ticket}).' }
    },
    {
      id: 'q-pia-draft', kind: 'pia', band: 'else', project: 'rubric-helper', owner: 'Dr. Hana Kobayashi', holder: 'Dr. Hana Kobayashi',
      askedAt: ago(4 * DAY + 1 * HOUR), ageGap: 'A3', readOnly: true,
      kindLabel: 'Privacy assessment', ask: 'The owner is writing the assessment',
      meta: [{ text: 'Held by Dr. Hana Kobayashi', holder: true }, { text: 'draft', mono: true }],
      record: { state: 'draft', reviewer: null, ticket: null }
    },
    {
      id: 'q-agent', kind: 'agent', band: 'else', project: 'mock-app', owner: 'Instructor One', holder: 'whoever minted the token',
      askedAt: ago(46 * MIN), expiresAt: NOW + 23 * HOUR + 14 * MIN,
      kindLabel: 'Agent’s question', ask: 'An agent asked to add a member to this project',
      meta: [{ text: 'Held by whoever minted the token', holder: true, gap: 'A8' }, { text: 'members:manage', mono: true }, { text: 'lapses in 23h' }],
      action: {
        capability: 'members:manage', method: 'POST', path: '/v1/projects/22222222-2222-4222-8222-222222222222/members',
        bodySha256: '0aa6131a7f3b5c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f', summary: 'add a member to this project'
      },
      token: { name: 'the agent that builds this app', capabilities: ['project:read', 'build:create', 'release:deploy'], rateLimit: 600, lastUsed: 'never', expires: '18 December 2026' },
      preview: { type: 'pending_action.rejected', lead: 'Rich Tape refused an agent’s request to add a member to this project:' }
    }
  ];

  /* ---------------- Health ---------------- */

  var INCIDENTS = [
    { project: 'rubric-helper', env: 'staging', at: ago(2 * HOUR + 10 * MIN),
      exitReason: 'the readiness probe never answered 200', failedCheck: 'GET /healthz from inside the edge',
      diffSinceHealthy: 'runtime.health: /healthz → /never-ready', logTail: 'Error: connect ECONNREFUSED 127.0.0.1:27017',
      serving: 'the release from 6 days ago' },
    { project: 'field-notes', env: 'sandbox', at: ago(1 * DAY + 3 * HOUR),
      exitReason: 'exited with code 137 — out of memory at 256Mi', failedCheck: 'container state from the Docker driver',
      diffSinceHealthy: 'services.0: + redis@7 (declared, not bound)', logTail: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      serving: 'the release from 4 days ago' }
  ];

  var GAPS = [
    ['A1', '§26’s non-repudiation rule is not built: no administrator’s reason is required anywhere, and who acted is only half-recorded.'],
    ['A2', 'There is no queue read. This page is assembled from 3N+1 reads.'],
    ['A3', 'Nothing records when anyone asked. Approvals show an upper bound; records show their last change.'],
    ['A4', 'Domains, audience upgrades and launch overrides are not modelled at all.'],
    ['A5', 'Events have no actor field and no read across projects.'],
    ['A6', 'The API lets an administrator confirm another person’s agent; this console offers reject only.'],
    ['A7', 'The fleet is unpaginated and has no launchedAt, department, domains or spend.'],
    ['A8', 'A token records no minter, and a release names its author only by id.'],
    ['A9', 'Incidents have no open or closed state.'],
    ['A10', 'People has no read.'],
    ['A11', 'Spend has no read.'],
    ['A12', 'A driver’s unenforceable policies and custom-domain certificates have no read.']
  ];

  global.ADMIN_DATA = {
    NOW: NOW, MIN: MIN, HOUR: HOUR, DAY: DAY,
    admin: 'Rich Tape', projects: PROJECTS, queue: QUEUE, incidents: INCIDENTS, gaps: GAPS,
    reads: 1 + 3 * PROJECTS.length
  };
})(window);
