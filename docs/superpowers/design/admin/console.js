/* The administrator's console — a clickable mockup. Composes window.Manifest (the shared
 * design system) and window.ManifestAdmin (its proposed additions) over window.ADMIN_DATA.
 * Nothing here calls an API: see the design document, §10, for what each screen needs. */
(function () {
  'use strict';

  var React = window.React, ReactDOM = window.ReactDOM, h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;
  var M = window.Manifest, A = window.ManifestAdmin, D = window.ADMIN_DATA;
  var MIN = D.MIN;

  /* ---------- time ---------- */

  function ageShort(ms) {
    var m = Math.max(0, Math.floor(ms / 60000));
    if (m < 60) return m + 'm';
    var hh = Math.floor(m / 60);
    if (hh < 24) return hh + 'h' + (hh < 10 && m % 60 ? ' ' + (m % 60) + 'm' : '');
    var d = Math.floor(hh / 24);
    return d + 'd' + (hh % 24 ? ' ' + (hh % 24) + 'h' : '');
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function ageLong(ms) {
    var m = Math.max(0, Math.floor(ms / 60000));
    if (m < 60) return plural(m, 'minute');
    var hh = Math.floor(m / 60);
    if (hh < 24) return plural(hh, 'hour') + (m % 60 ? ', ' + plural(m % 60, 'minute') : '');
    var d = Math.floor(hh / 24);
    return plural(d, 'day') + (hh % 24 ? ', ' + plural(hh % 24, 'hour') : '');
  }
  function clock(t) { return new Date(t).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }); }
  function day(t) { return new Date(t).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' }); }

  function useNow(step) {
    var s = useState(Date.now());
    useEffect(function () {
      var t = setInterval(function () { s[1](Date.now()); }, step);
      return function () { clearInterval(t); };
    }, []);
    return s[0];
  }

  var SCREENS = ['queue', 'fleet', 'health'];
  function readHash() { var x = (location.hash || '').slice(1); return SCREENS.indexOf(x) >= 0 ? x : 'queue'; }
  function useScreen() {
    var s = useState(readHash);
    useEffect(function () {
      function on() { s[1](readHash()); window.scrollTo(0, 0); }
      window.addEventListener('hashchange', on);
      return function () { window.removeEventListener('hashchange', on); };
    }, []);
    return s[0];
  }

  // The fleet drawer can send the queue to an item; the queue reads this when it mounts.
  var wantItem = null;

  function byAsked(a, b) { return a.askedAt - b.askedAt; }
  function unique(xs) { return xs.filter(function (x, i) { return xs.indexOf(x) === i; }); }
  function fill(s, vars) { return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] || '…'; }); }

  function sec(title, children, gap) {
    return h('section', { className: 'mfa-sec' },
      title ? h('h3', { className: 'mfa-sec__title', 'data-gap': gap }, title) : null,
      children);
  }
  function para(text, gap) { return h('p', { className: 'mfa-sec__body', 'data-gap': gap }, text); }

  /* ---------- the queue ---------- */

  var KINDS = [
    { key: 'approval', label: 'Release approvals', kinds: ['approval'] },
    { key: 'records', label: 'IAM and privacy', kinds: ['iam', 'pia'] },
    { key: 'agent', label: 'Agents’ questions', kinds: ['agent'] },
    { key: 'requests', label: 'Domains, audiences, overrides', kinds: ['domain', 'audience', 'override'] }
  ];

  function Queue(props) {
    var now = props.now;
    var first = D.queue.slice().sort(byAsked).filter(function (i) { return i.band === 'us'; })[0];
    var sel = useState(wantItem || (first && first.id));
    var query = useState('');
    var facets = useState({});
    var st = useState({});
    var selected = sel[0], ui = st[0];
    wantItem = null;

    function patch(id, obj) {
      st[1](function (prev) {
        var next = Object.assign({}, prev);
        next[id] = Object.assign({}, prev[id] || {}, obj);
        return next;
      });
    }

    var on = KINDS.filter(function (k) { return facets[0][k.key]; });
    function visible(it) {
      if (on.length && !on.some(function (k) { return k.kinds.indexOf(it.kind) >= 0; })) return false;
      var s = query[0].trim().toLowerCase();
      if (!s) return true;
      return [it.project, it.owner, it.ask, it.holder || '', it.kindLabel].join(' ').toLowerCase().indexOf(s) >= 0;
    }

    var all = D.queue.slice().sort(byAsked);
    var us = all.filter(function (i) { return i.band === 'us'; });
    var others = all.filter(function (i) { return i.band === 'else'; });
    var usV = us.filter(visible), othersV = others.filter(visible);
    var order = usV.concat(othersV).map(function (i) { return i.id; });
    var oldest = us[0];
    var item = D.queue.filter(function (i) { return i.id === selected; })[0];

    function select(id) {
      sel[1](id);
      if (window.innerWidth < 1100) {
        setTimeout(function () { var p = document.getElementById('pane'); if (p) p.scrollIntoView({ block: 'start' }); }, 0);
      }
    }

    useEffect(function () {
      function onKey(e) {
        var tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'j' || e.key === 'k') {
          var i = order.indexOf(selected);
          var n = e.key === 'j' ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
          if (order[n]) {
            sel[1](order[n]);
            var b = document.getElementById('row-' + order[n]);
            if (b) b.focus();
          }
          e.preventDefault();
        } else if (e.key === '/') {
          var s = document.getElementById('queue-search');
          if (s) { s.focus(); e.preventDefault(); }
        }
      }
      window.addEventListener('keydown', onKey);
      return function () { window.removeEventListener('keydown', onKey); };
    });

    function decorate(it) {
      var meta = it.meta.map(function (m) {
        return m.text.indexOf('lapses') === 0 && it.expiresAt ? { text: 'lapses in ' + ageShort(it.expiresAt - now) } : m;
      });
      return Object.assign({}, it, { ageText: ageShort(now - it.askedAt), meta: meta });
    }

    function band(title, list, note) {
      return h('section', { className: 'mfa-band', 'aria-label': title },
        h('div', { className: 'mfa-band__head' },
          h('h2', { className: 'mfa-band__title' }, title),
          h('span', { className: 'mfa-band__note' }, note)),
        h('ul', { className: 'mfa-rows' }, list.length
          ? list.map(function (it) {
            return h(A.QueueRow, {
              key: it.id, id: 'row-' + it.id, item: decorate(it), selected: it.id === selected,
              onSelect: function () { select(it.id); }
            });
          })
          : h('li', { className: 'mfa-rows__empty' }, 'Nothing here matches the filter.')));
    }

    var sinceRefresh = (now - D.NOW) % (60 * 1000);

    return h(React.Fragment, null,
      h(A.WaitHeadline, {
        oldest: oldest ? {
          text: ageLong(now - oldest.askedAt), bound: !!oldest.bound, gap: oldest.bound ? 'A3' : null,
          note: oldest.bound ? 'A release approval. Nothing records when production was asked for, so this is the longest it can have waited.' : null
        } : null,
        people: unique(us.map(function (i) { return i.owner; })).length,
        items: all.length, itemsLabel: 'items · ' + us.length + ' on us, ' + others.length + ' elsewhere',
        assembled: 'Assembled ' + (sinceRefresh < 15000 ? 'just now' : Math.round(sinceRefresh / 1000) + ' seconds ago') +
          ' from ' + D.reads + ' reads · again every 60 seconds',
        assembledGap: 'A2'
      }),
      h(A.FilterBar, {
        id: 'queue-search', label: 'Filter the queue', query: query[0], placeholder: 'Filter by app, person or ask  ( / )',
        onQuery: query[1],
        facets: KINDS.map(function (k) {
          return {
            label: k.label, on: !!facets[0][k.key],
            onToggle: function () { var n = Object.assign({}, facets[0]); n[k.key] = !n[k.key]; facets[1](n); }
          };
        }),
        onClear: function () { query[1](''); facets[1]({}); },
        count: (usV.length + othersV.length) + ' of ' + all.length + ' · j and k move'
      }),
      h('div', { className: 'mfa-queue' },
        h('div', null,
          band('Waiting on us', usV, 'The headline counts these.'),
          band('Waiting on someone else', othersV, 'Shown, not headlined. Chasing them is still ours.')),
        h('section', { className: 'mfa-pane', id: 'pane', 'aria-label': 'The selected item' },
          item
            ? h(Pane, { key: item.id, item: item, now: now, ui: ui[item.id] || {}, patch: function (o) { patch(item.id, o); } })
            : sec(null, para('Choose an item to see what it asks, and decide it.')))));
  }

  /* ---------- the decision pane ---------- */

  function holderChip(it) {
    return h(M.StateChip, { state: 'waiting', pulse: false, label: it.band === 'us' ? 'Waiting on us' : 'Waiting on ' + it.holder });
  }

  function Pane(p) {
    var it = p.item, now = p.now;
    var head = h('header', { className: 'mfa-pane__head' },
      h('div', { className: 'mfa-pane__top' },
        h('span', { className: 'mfa-over', 'data-gap': it.kindGap }, it.kindLabel),
        holderChip(it)),
      h('h2', { className: 'mfa-pane__ask' }, it.ask),
      h('p', { className: 'mfa-pane__meta' },
        h('span', { className: 'mfa-mono' }, it.project),
        h('span', null, 'owned by ' + it.owner),
        h('span', { 'data-gap': it.ageGap || (it.bound ? 'A3' : null) },
          (it.bound ? 'waiting up to ' : 'waiting ') + ageLong(now - it.askedAt))));
    var body;
    if (it.kind === 'approval') body = PaneApproval(p);
    else if (it.kind === 'agent') body = PaneAgent(p);
    else if (it.kind === 'iam' || it.kind === 'pia') body = it.readOnly ? PaneOwnerHolds(p) : PaneRecord(p);
    else body = PaneRequest(p);
    return h(React.Fragment, null, head, body);
  }

  function checklistView(items) {
    return h('ul', { className: 'mfa-check' }, items.map(function (c) {
      var cls = c.state === 'met' ? 'met' : c.state === 'unmet' ? 'unmet' : 'notbuilt';
      return h('li', { key: c.id },
        h('span', { className: 'mfa-check__mark mfa-check__mark--' + cls, role: 'img', 'aria-label': c.state }),
        h('span', { className: 'mfa-check__id' }, c.id),
        h('span', { className: 'mfa-check__why' }, c.why ? c.title + '. ' + c.why : c.title));
    }));
  }

  function resetButton(patch) {
    return h('div', null, h(M.Button, {
      kind: 'tertiary', size: 'sm',
      onClick: function () { patch({ outcome: null, stepUp: null, previewAt: null, reason: '', ticket: '', next: null }); }
    }, 'Start this item again'));
  }

  function result(kind, title, lines, patch) {
    return h('div', { className: 'mfa-result mfa-result--' + kind, role: 'status' },
      h('p', { className: 'mfa-result__title' }, title),
      lines.map(function (l, i) { return h('p', { key: i, className: 'mfa-result__body' }, l); }),
      resetButton(patch));
  }

  function PaneApproval(p) {
    var it = p.item, ui = p.ui, patch = p.patch, now = p.now, r = it.release;
    var previewId = '7e1f0c2a-4b6d-4e8f-9a1c-' + it.id.replace(/[^a-z]/g, '').slice(0, 12).padEnd(12, '0');

    var decide;
    if (ui.outcome && ui.outcome.decision === 'approved') {
      decide = result('steady', 'Approved for production', [
        h(React.Fragment, null, 'Recorded at ' + clock(ui.outcome.at) + ', bound to ', h(A.MachineValue, { value: r.digest, label: 'digest' }), '. It binds this digest and nothing else.'),
        it.owner + ' reads “' + D.admin + ' approved this release for production.” Your reason is on the approval record.'
      ], patch);
    } else if (ui.outcome && ui.outcome.decision === 'rejected') {
      decide = result('neutral', 'Not approved. That is final for this release.', [
        it.owner + ' reads “' + D.admin + ' did not approve this release: ' + (ui.reason || '').trim() + '”, and sees it on the launch checklist. Nothing that is running changed.'
      ], patch);
    } else if (ui.stepUp) {
      decide = h('div', { className: 'mfa-result mfa-result--stepup', role: 'status' },
        h('p', { className: 'mfa-result__title' }, 'Sign in again to approve'),
        h('p', { className: 'mfa-result__body' }, 'The platform answered ', h('code', { className: 'mfa-mono' }, 'STEP_UP_REQUIRED'),
          '. Approving a release needs a fresh CWL sign-in. You come back to this same preview, and nothing is recorded until you do.'),
        h('div', { className: 'mfa-obs__actions' },
          h(M.Button, { kind: 'primary', size: 'sm', onClick: function () { patch({ stepUp: null, outcome: { decision: 'approved', at: Date.now() } }); } }, 'Sign in with CWL'),
          h(M.Button, { kind: 'tertiary', size: 'sm', onClick: function () { patch({ stepUp: null }); } }, 'Not now')));
    } else if (!ui.previewAt) {
      decide = para('Take the preview first. Approve and reject both name it, and the record copies its diff.');
    } else {
      decide = h(A.ObservedAction, {
        id: 'reason-' + it.id, owner: it.owner, reason: ui.reason, onReason: function (v) { patch({ reason: v }); },
        placeholder: 'Why, in words ' + it.owner + ' can act on.',
        hint: 'Required on someone else’s project (§26). ' + it.owner + ' reads it.',
        previews: [
          { label: 'If you approve', type: 'release.approved', lead: D.admin + ' approved this release for production.', reasonIn: 'record' },
          { label: 'If you reject', type: 'release.approval_rejected', lead: D.admin + ' did not approve this release:', reasonIn: 'sentence',
            after: 'A rejection is final for this release. ' + it.owner + ' also reads it on the launch checklist.' }
        ],
        previewIndex: ui.previewIdx || 0, onPreviewIndex: function (i) { patch({ previewIdx: i }); },
        actions: [
          { label: 'Approve for production', kind: 'primary', needsReason: true, onClick: function () { patch({ stepUp: true }); } },
          { label: 'Reject', kind: 'ghostDanger', needsReason: true, onClick: function () { patch({ outcome: { decision: 'rejected', at: Date.now() } }); } }
        ],
        note: 'Approving asks you to sign in again.'
      });
    }

    return h(React.Fragment, null,
      sec('The release', h(A.FactList, {
        rows: [
          { label: 'Release', value: h(A.MachineValue, { value: r.id, label: 'release id' }) },
          { label: 'Image', value: h(A.MachineValue, { value: r.digest, label: 'image digest' }) },
          { label: 'Made by', value: r.madeBy + ', ' + ageLong(r.madeAgo) + ' ago', gap: 'A8' },
          { label: r.launched ? 'Launched' : 'First launch', value: r.launched ? 'Yes. A release goes to production self-serve unless it changes a sensitive field, and this one changes two.' : 'Nothing of this app is in production yet.' },
          { label: 'Scan', value: r.scan, mono: true }
        ]
      })),
      sec(r.launched ? 'The self-serve check' : 'The launch checklist', checklistView(it.checklist)),
      sec('What your decision will record', ui.previewAt
        ? h(React.Fragment, null,
          h('div', { className: 'mfa-diff__meta' }, 'Preview', h(A.MachineValue, { value: previewId, label: 'preview id' }),
            'taken by ' + D.admin + ' at ' + clock(ui.previewAt) + ' · valid until ' + clock(ui.previewAt + 30 * MIN)),
          h(A.DiffView, { diff: it.diff }))
        : h(React.Fragment, null,
          para('A stored copy of exactly what your decision records. A language model writes its summary, and it is kept for 30 minutes. Looking at this item has recorded nothing yet.'),
          h('div', null, h(M.Button, { kind: 'secondary', size: 'sm', onClick: function () { patch({ previewAt: Date.now() }); } }, 'Take the preview')))),
      sec('Decide', decide),
      sec('Recent events in ' + it.project, h('ul', { className: 'mfa-events' }, it.events.map(function (e, i) {
        return h(A.EventLine, { key: i, when: ageShort(now - e.at) + ' ago', type: e.type, text: e.text });
      })), 'A5'));
  }

  function PaneAgent(p) {
    var it = p.item, ui = p.ui, patch = p.patch, now = p.now, a = it.action, t = it.token;
    var stop = ui.outcome
      ? result('neutral', 'Rejected for them', ['The agent was told no, in your words. ' + it.owner + ' reads “' + D.admin + ' refused an agent’s request to ' + a.summary + ': ' + (ui.reason || '').trim() + '”'], patch)
      : h(A.ObservedAction, {
        id: 'reason-' + it.id, owner: it.owner, reason: ui.reason, onReason: function (v) { patch({ reason: v }); },
        placeholder: 'What the agent should be told.',
        hint: 'Required. The agent receives it word for word, and so does ' + it.owner + '.',
        previews: [{ label: 'reject', type: 'pending_action.rejected', lead: it.preview.lead, reasonIn: 'sentence', after: 'There is no Confirm here. Saying yes to someone else’s agent is theirs to do.' }],
        actions: [{ label: 'Reject for them', kind: 'ghostDanger', needsReason: true, onClick: function () { patch({ outcome: { at: Date.now() } }); } }]
      });

    return h(React.Fragment, null,
      sec('What it asked for', h(A.FactList, {
        rows: [
          { label: 'Capability', value: h('span', null, h('code', { className: 'mfa-mono' }, a.capability), ' · one of D24’s four') },
          { label: 'Request', value: a.method + ' ' + a.path, mono: true },
          { label: 'Body', value: h(A.MachineValue, { value: 'sha256:' + a.bodySha256, label: 'body hash' }) },
          { label: 'Lapses', value: 'in ' + ageLong(it.expiresAt - now) + ', and then the agent is told no' }
        ]
      })),
      sec('The token that asked', h(A.FactList, {
        rows: [
          { label: 'Name', value: '‘' + t.name + '’' },
          { label: 'May', value: h(A.Tags, { items: t.capabilities }) },
          { label: 'Rate limit', value: t.rateLimit + ' requests a minute' },
          { label: 'Last used', value: t.lastUsed },
          { label: 'Expires', value: t.expires },
          { label: 'Minted by', value: 'Not recorded. A token has no minter field.', gap: 'A8' }
        ]
      })),
      sec('Who decides', para('The person who minted the token decides, in their own queue (§26). If it looks like a runaway agent, you can stop it here.')),
      sec('Stop it instead', stop, 'A6'));
  }

  function stateLabel(kind, state) {
    var L = {
      draft: 'Draft', submitted: kind === 'iam' ? 'With UBC IAM' : 'With the Privacy Office',
      active: 'Active', change_requested: 'Change with UBC IAM', approved: 'Approved', expired: 'Expired'
    };
    return L[state] || state;
  }

  function recordFacts(it, now) {
    var r = it.record;
    return h(A.FactList, {
      rows: [
        { label: 'State', value: h(A.RawChip, { raw: r.state, label: stateLabel(it.kind, r.state), state: r.state === 'active' || r.state === 'approved' ? 'steady' : 'waiting' }) },
        r.entityId ? { label: 'Entity ID', value: r.entityId, mono: true } : null,
        r.acsUrl ? { label: 'ACS URL', value: r.acsUrl, mono: true } : null,
        r.attributes ? { label: r.requested ? 'Registered' : (r.state === 'draft' ? 'Attributes asked for' : 'Attributes'), value: h(A.Tags, { items: r.attributes }) } : null,
        r.requested ? {
          label: 'Requested', value: h(A.Tags, {
            items: r.requested.map(function (x) { return r.attributes.indexOf(x) < 0 ? { text: x, add: true } : x; })
          })
        } : null,
        { label: it.kind === 'iam' ? 'UBC IAM ticket' : 'Reference', value: r.ticket || 'none yet', mono: !!r.ticket },
        r.reviewer !== undefined ? { label: 'Reviewer', value: r.reviewer || 'none yet' } : null,
        { label: 'Last changed', value: ageLong(now - it.askedAt) + ' ago', gap: 'A3' }
      ]
    });
  }

  function PaneRecord(p) {
    var it = p.item, ui = p.ui, patch = p.patch, now = p.now;
    var next = ui.next || it.next[0].value;
    var ticket = ui.ticket !== undefined ? ui.ticket : (it.record.ticket || '');

    var record = ui.outcome
      ? result('steady', 'Recorded as ' + next, [it.owner + ' reads “' + fill(it.preview.lead, { ticket: ticket, state: next }) + '”. Not why.'], patch)
      : h(A.ObservedAction, {
        owner: it.owner, canRecord: false, admissionGap: 'A1',
        admission: it.owner + ' will see that you recorded this, and not why.',
        previews: [{ label: 'record', type: it.preview.type, lead: fill(it.preview.lead, { ticket: ticket, state: next }) }],
        actions: [{ label: 'Record it', kind: 'primary', disabled: !ticket.trim(), onClick: function () { patch({ outcome: { at: Date.now() } }); } }],
        note: ticket.trim() ? null : 'A record needs the ticket reference, pasted in.'
      });

    return h(React.Fragment, null,
      sec('What is recorded', recordFacts(it, now)),
      sec('Record the next state', h(React.Fragment, null,
        para('Only the states §9’s arrows allow from ' + it.record.state + ' are offered, so an impossible transition cannot be asked for.'),
        h(M.Choice, {
          name: 'next-' + it.id, value: next, options: it.next,
          onChange: function (v) { patch({ next: v }); }
        }),
        h('div', { className: 'mfa-row2' },
          h('div', { className: 'mfa-field' },
            h('label', { htmlFor: 'ticket-' + it.id }, it.ticketLabel),
            h('input', { id: 'ticket-' + it.id, value: ticket, placeholder: it.ticketPlaceholder, onChange: function (e) { patch({ ticket: e.target.value }); } })),
          it.reviewer ? h('div', { className: 'mfa-field' },
            h('label', { htmlFor: 'reviewer-' + it.id }, 'Reviewer'),
            h('input', { id: 'reviewer-' + it.id, defaultValue: it.record.reviewer || '' })) : null,
          it.cert ? h('div', { className: 'mfa-field' },
            h('label', { htmlFor: 'fp-' + it.id }, 'Certificate fingerprint'),
            h('input', { id: 'fp-' + it.id, placeholder: 'AB:CD:EF:01:23:45' })) : null,
          it.cert ? h('div', { className: 'mfa-field' },
            h('label', { htmlFor: 'exp-' + it.id }, 'Certificate expires'),
            h('input', { id: 'exp-' + it.id, type: 'date' })) : null))),
      sec('Record it', record));
  }

  function PaneOwnerHolds(p) {
    var it = p.item;
    return h(React.Fragment, null,
      sec('What is recorded', recordFacts(it, p.now)),
      sec('Who has it', para(it.holder + ' writes the assessment. There is nothing for us to do until it goes to the Privacy Office, and then it is recorded here.')),
      sec(null, para('Its age is from the record’s last change. Nothing records when the owner started.', 'A3')));
  }

  function PaneRequest(p) {
    var it = p.item, ui = p.ui, patch = p.patch;
    var decided = ui.outcome;
    return h(React.Fragment, null,
      sec('What is asked', h(A.FactList, { rows: it.facts })),
      sec('In ' + it.owner + '’s words', h('blockquote', { className: 'mfa-quote' }, it.quote)),
      sec('What changes if you grant it', para(it.changes)),
      sec('Decide', decided
        ? result(decided.granted ? 'steady' : 'neutral', decided.granted ? it.actions[0] + ': done' : 'Declined', [
          it.owner + ' reads “' + (decided.granted ? it.preview.lead + ' ' + (ui.reason || '').trim() : D.admin + ' declined: ' + (ui.reason || '').trim()) + '”'
        ], patch)
        : h(A.ObservedAction, {
          id: 'reason-' + it.id, owner: it.owner, reason: ui.reason, onReason: function (v) { patch({ reason: v }); },
          placeholder: 'Why, in words ' + it.owner + ' can act on.',
          hint: 'Required on someone else’s project (§26).',
          previews: [{ label: 'grant', type: it.preview.type, lead: it.preview.lead, reasonIn: 'sentence', gap: it.preview.gap }],
          actions: [
            { label: it.actions[0], kind: 'primary', needsReason: true, onClick: function () { patch({ outcome: { granted: true, at: Date.now() } }); } },
            { label: it.actions[1], kind: 'ghostDanger', needsReason: true, onClick: function () { patch({ outcome: { granted: false, at: Date.now() } }); } }
          ]
        }), 'A4'));
  }

  /* ---------- the fleet ---------- */

  function lastDeploy(p) {
    return Math.max.apply(null, ['sandbox', 'staging', 'production'].map(function (k) { return p.envs[k].deployAt || 0; }));
  }

  function envCell(e, now) {
    return h(A.EnvCell, {
      env: e && e.state ? {
        state: e.state, age: ageShort(now - e.deployAt),
        incident: e.incidentAt && e.incidentAt > e.deployAt ? ageShort(now - e.incidentAt) + ' ago' : null
      } : null
    });
  }

  function Fleet(props) {
    var now = props.now;
    var query = useState(''), facets = useState({}), sort = useState({ key: 'deploy', dir: 'desc' }), open = useState(null);

    var FACETS = [
      { key: 'prod', label: 'In production', test: function (p) { return !!p.envs.production.state; } },
      { key: 'inc', label: 'Last attempt failed', test: function (p) { return ['sandbox', 'staging', 'production'].some(function (k) { var e = p.envs[k]; return e.incidentAt && e.incidentAt > e.deployAt; }); } },
      { key: 'old', label: 'Older blueprint', test: function (p) { return !!p.superseded; } }
    ];
    var rows = D.projects.filter(function (p) {
      if (FACETS.some(function (f) { return facets[0][f.key] && !f.test(p); })) return false;
      var s = query[0].trim().toLowerCase();
      return !s || (p.slug + ' ' + p.owner + ' ' + p.blueprint).toLowerCase().indexOf(s) >= 0;
    });
    var k = sort[0].key, dir = sort[0].dir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var x = k === 'deploy' ? lastDeploy(a) : k === 'created' ? a.created : a[k];
      var y = k === 'deploy' ? lastDeploy(b) : k === 'created' ? b.created : b[k];
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });

    var project = D.projects.filter(function (p) { return p.slug === open[0]; })[0];

    return h(React.Fragment, null,
      h('div', { style: { marginBottom: 20 } },
        h('h1', { className: 'mfa-h1' }, 'Fleet'),
        h('p', { className: 'mfa-lede', 'data-gap': 'A7' }, 'Every app on the platform. Department, custom domains and this month’s AI spend are not in the fleet yet.')),
      h(A.FilterBar, {
        id: 'fleet-search', label: 'Filter the fleet', query: query[0], placeholder: 'Filter by app, owner or blueprint',
        onQuery: query[1],
        facets: FACETS.map(function (f) {
          return { label: f.label, on: !!facets[0][f.key], onToggle: function () { var n = Object.assign({}, facets[0]); n[f.key] = !n[f.key]; facets[1](n); } };
        }),
        onClear: function () { query[1](''); facets[1]({}); },
        count: rows.length + ' of ' + D.projects.length + ' apps'
      }),
      h(A.DataTable, {
        caption: 'Every app on the platform', rowKey: 'slug', rows: rows,
        sortKey: sort[0].key, sortDir: sort[0].dir,
        onSort: function (key) { sort[1]({ key: key, dir: sort[0].key === key && sort[0].dir === 'desc' ? 'asc' : 'desc' }); },
        onRow: function (r) { open[1](r.slug); },
        columns: [
          { key: 'slug', label: 'App', sortable: true, render: function (r) {
            return h('span', { className: 'mfa-cellstack' },
              h('button', { type: 'button', className: 'mfa-slugbtn', onClick: function (e) { e.stopPropagation(); open[1](r.slug); } }, r.slug),
              h('small', null, r.owner));
          } },
          { key: 'audience', label: 'Audience', render: function (r) { return h('span', { className: 'mfa-mono' }, r.audience); } },
          { key: 'sandbox', label: 'Sandbox', render: function (r) { return envCell(r.envs.sandbox, now); } },
          { key: 'staging', label: 'Staging', render: function (r) { return envCell(r.envs.staging, now); } },
          { key: 'production', label: 'Production', render: function (r) { return envCell(r.envs.production, now); } },
          { key: 'digest', label: 'Serving', render: function (r) {
            return h('span', { className: 'mfa-cellstack' },
              h(A.MachineValue, { value: r.digest, label: r.slug + ' digest', copy: false }),
              h('small', null, r.envs.production.state ? 'in production' : 'in staging'));
          } },
          { key: 'blueprint', label: 'Blueprint', sortable: true, render: function (r) {
            return h('span', { className: 'mfa-cellstack' }, h('span', { className: 'mfa-mono' }, r.blueprint),
              r.superseded ? h('small', { className: 'mfa-flag' }, 'newer: ' + r.superseded) : null);
          } },
          { key: 'deploy', label: 'Last deploy', sortable: true, align: 'right', render: function (r) { return ageShort(now - lastDeploy(r)) + ' ago'; } },
          { key: 'created', label: 'Created', sortable: true, align: 'right', render: function (r) { return day(r.created); } }
        ]
      }),
      project ? h(Drawer, { project: project, now: now, onClose: function () { open[1](null); } }) : null);
  }

  function Drawer(p) {
    var pr = p.project, now = p.now;
    var closeRef = useRef(null);
    useEffect(function () {
      if (closeRef.current) closeRef.current.focus();
      function onKey(e) { if (e.key === 'Escape') p.onClose(); }
      window.addEventListener('keydown', onKey);
      return function () { window.removeEventListener('keydown', onKey); };
    }, [pr.slug]);

    var inc = D.incidents.filter(function (i) { return i.project === pr.slug; });
    var items = D.queue.filter(function (q) { return q.project === pr.slug; });

    var envs = ['production', 'staging', 'sandbox'].map(function (k) {
      var e = pr.envs[k];
      if (!e.state) return h('div', { key: k, className: 'mfa-panel__line' },
        h('span', { className: 'mfa-over', style: { width: 88 } }, k), h(A.EnvCell, { env: null }));
      var failed = e.incidentAt && e.incidentAt > e.deployAt;
      var incident = inc.filter(function (i) { return i.env === k; })[0];
      if (failed && incident) {
        return h('div', { key: k },
          h(M.TwoFacts, {
            serving: { overline: 'Serving · ' + k, title: e.state + ' · ' + incident.serving, note: A.shorten(pr.digest), tone: 'steady' },
            attempt: { overline: 'Last attempt · ' + ageShort(now - e.incidentAt) + ' ago', title: 'failed: ' + incident.exitReason, note: incident.failedCheck, tone: 'attention' }
          }));
      }
      return h('div', { key: k, className: 'mfa-panel__line' },
        h('span', { className: 'mfa-over', style: { width: 88 } }, k),
        h(A.EnvCell, { env: { state: e.state, age: 'since ' + ageShort(now - e.deployAt) + ' ago' } }));
    });

    var events = [
      { at: lastDeploy(pr), type: 'instance.healthy', text: pr.slug + ' is running in ' + (pr.envs.production.state ? 'production' : 'staging') + '.' },
      { at: lastDeploy(pr) - 2 * MIN, type: 'instance.starting', text: pr.slug + ' is starting in ' + (pr.envs.production.state ? 'production' : 'staging') + '.' },
      { at: lastDeploy(pr) - 3 * MIN, type: 'instance.provisioning', text: 'Preparing ' + pr.slug + ' in ' + (pr.envs.production.state ? 'production' : 'staging') + '.' },
      { at: lastDeploy(pr) - 9 * MIN, type: 'build.succeeded', text: pr.slug + ' was built.' }
    ];
    inc.forEach(function (i) {
      events.unshift({ at: i.at, type: 'instance.failed', text: pr.slug + ' failed to start in ' + i.env + '. The incident records what it printed and what changed since it last worked.' });
    });

    return h(React.Fragment, null,
      h('div', { className: 'mfa-scrim', onClick: p.onClose }),
      h('aside', { className: 'mfa-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drawer-title' },
        h('button', { type: 'button', ref: closeRef, className: 'mfa-iconbtn mfa-drawer__close', 'aria-label': 'Close', onClick: p.onClose }, A.icon(A.ICONS.CLOSE, 18)),
        h('header', { className: 'mfa-pane__head' },
          h('span', { className: 'mfa-over' }, 'App'),
          h('h2', { className: 'mfa-pane__ask', id: 'drawer-title', style: { fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: 0 } }, pr.slug),
          h('p', { className: 'mfa-pane__meta' },
            h('span', null, 'owned by ' + pr.owner), h('span', { className: 'mfa-mono' }, pr.audience), h('span', null, 'created ' + day(pr.created)))),
        sec('Environments', h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } }, envs)),
        items.length ? sec('In the queue', h('ul', { className: 'mfa-events' }, items.map(function (q) {
          return h('li', { key: q.id, className: 'mfa-ev' },
            h('span', { className: 'mfa-ev__when' }, ageShort(now - q.askedAt)),
            h('span', { className: 'mfa-ev__body' },
              h('a', { href: '#queue', className: 'mfa-ev__text', onClick: function () { wantItem = q.id; } }, q.ask),
              h('span', { className: 'mfa-ev__type' }, q.kindLabel + (q.band === 'us' ? ' · on us' : ' · ' + q.holder))));
        }))) : null,
        sec('Recent events', h('ul', { className: 'mfa-events' }, events.map(function (e, i) {
          return h(A.EventLine, { key: i, when: ageShort(now - e.at) + ' ago', type: e.type, text: e.text });
        })), 'A5'),
        sec(null, para('An administrator can see everything here and changes nothing from this page. Deploying, adding a member, setting a secret or committing on someone else’s app waits for §26’s reason to exist.', 'A1'))));
  }

  /* ---------- Health and risk ---------- */

  function Panel(p) {
    return h('section', { className: 'mfa-panel' },
      h('div', { className: 'mfa-panel__head' },
        h('h2', { className: 'mfa-panel__title' }, p.title),
        p.count !== undefined ? h('span', { className: 'mfa-panel__count' }, p.count) : null),
      p.children ? h('ul', { className: 'mfa-panel__list' }, p.children) : null,
      p.foot ? h('p', { className: 'mfa-panel__foot', 'data-gap': p.footGap }, p.foot) : null);
  }

  function Health(props) {
    var now = props.now;
    var certs = D.projects.filter(function (p) { return p.certExpires && p.certExpires - now < 90 * D.DAY; })
      .sort(function (a, b) { return a.certExpires - b.certExpires; });
    var stale = D.projects.filter(function (p) { return p.staleScanDays; });
    var fixable = D.projects.filter(function (p) { return p.fixableHigh; });
    var old = D.projects.filter(function (p) { return p.superseded; });

    return h(React.Fragment, null,
      h('div', { style: { marginBottom: 20 } },
        h('h1', { className: 'mfa-h1' }, 'Health and risk'),
        h('p', { className: 'mfa-lede' }, 'What fails quietly: a certificate that expires, a deploy that never answered, a scan that proves less than it looks.')),
      h('div', { className: 'mfa-health' },
        h(Panel, {
          title: 'Certificates expiring within 90 days', count: certs.length,
          foot: 'Service Provider certificates, from each app’s IAM registration. Red within 14 days. Custom-domain certificates are not visible: domains are not modelled yet.',
          footGap: 'A12'
        }, certs.map(function (p) {
          var days = Math.ceil((p.certExpires - now) / D.DAY);
          return h('li', { key: p.slug, className: 'mfa-panel__item' },
            h('div', { className: 'mfa-panel__line' },
              h('span', { className: 'mfa-mono', style: { fontWeight: 500 } }, p.slug),
              h('span', { className: 'mfa-days ' + (days <= 14 ? 'mfa-days--red' : 'mfa-days--amber') }, days + ' days'),
              h('span', { style: { color: 'var(--ink-subtle)', fontSize: 12 } }, 'expires ' + day(p.certExpires))),
            h('span', { className: 'mfa-mono', style: { color: 'var(--ink-subtle)', fontSize: 11.5 } }, 'https://manifest.internal/sp/' + p.slug + '/production'),
            days <= 14 ? h('span', { style: { fontSize: 12.5, color: 'var(--attention-deep)' } }, 'If it expires, nobody can sign in to this live course app. Renewal needs a change request to UBC IAM.') : null);
        })),

        h(Panel, {
          title: 'Deploys that never answered', count: D.incidents.length,
          foot: 'The latest incident per environment, from the fleet. Nothing says whether one is still open.', footGap: 'A9'
        }, D.incidents.map(function (i) {
          return h('li', { key: i.project + i.env, className: 'mfa-panel__item' },
            h('div', { className: 'mfa-panel__line' },
              h('span', { className: 'mfa-mono', style: { fontWeight: 500 } }, i.project),
              h('span', { className: 'mfa-mono', style: { color: 'var(--ink-subtle)' } }, i.env),
              h('span', { style: { color: 'var(--ink-subtle)', fontSize: 12 } }, ageShort(now - i.at) + ' ago'),
              h(M.StateChip, { state: 'steady', label: 'Still serving ' + i.serving, pulse: false })),
            h(A.FactList, {
              rows: [
                { label: 'How it ended', value: i.exitReason },
                { label: 'The check', value: i.failedCheck, mono: true },
                { label: 'Since healthy', value: i.diffSinceHealthy, mono: true }
              ]
            }),
            h(M.InverseSurface, { inset: i.logTail }));
        })),

        h(Panel, {
          title: 'Scans that prove less than they look', count: stale.length + fixable.length,
          foot: 'From the scan recorded on each serving release.'
        },
          stale.map(function (p) {
            return h('li', { key: 's' + p.slug, className: 'mfa-panel__item' },
              h('div', { className: 'mfa-panel__line' },
                h('span', { className: 'mfa-mono', style: { fontWeight: 500 } }, p.slug),
                h(A.RawChip, { state: 'waiting', label: 'Stale database', raw: 'stale: true' })),
              h('span', { style: { fontSize: 13, color: 'var(--ink-muted)' } }, 'Scanned against a database ' + p.staleScanDays + ' days old. A clean result from a stale database is not evidence there is nothing to find (§12).'));
          }),
          fixable.map(function (p) {
            return h('li', { key: 'f' + p.slug, className: 'mfa-panel__item' },
              h('div', { className: 'mfa-panel__line' },
                h('span', { className: 'mfa-mono', style: { fontWeight: 500 } }, p.slug),
                h(A.RawChip, { state: 'attention', label: 'A fix exists', raw: 'fixable.high: 1', pulse: false })),
              h('span', { style: { fontSize: 13, color: 'var(--ink-muted)' } },
                'In staging: ', h('code', { className: 'mfa-mono' }, 'GHSA-3xgq-45jj-v275'), ' in ', h('code', { className: 'mfa-mono' }, 'cross-spawn@7.0.3'),
                ', fixed in 7.0.5 after this release was built. Its next build is refused until it takes the fix.'));
          })),

        h(Panel, {
          title: 'Pinned to an older blueprint', count: old.length,
          foot: 'A major version is a breaking change, so nothing moves an app automatically. Its owner rebuilds on the new one.'
        }, old.map(function (p) {
          return h('li', { key: p.slug, className: 'mfa-panel__item' },
            h('div', { className: 'mfa-panel__line' },
              h('span', { className: 'mfa-mono', style: { fontWeight: 500 } }, p.slug),
              h('span', { className: 'mfa-mono' }, p.blueprint + ' → ' + p.superseded),
              h('span', { style: { fontSize: 12, color: 'var(--ink-subtle)' } }, 'owned by ' + p.owner)));
        })),

        h(Panel, {
          title: 'Policies a driver says it cannot enforce',
          foot: 'Not visible. §12’s capabilities() has no operation, so this panel has nothing to show yet.', footGap: 'A12'
        })));
  }

  /* ---------- the mockup's gap overlay ---------- */

  function GapSwitch(p) {
    return h('div', { className: 'mfa-gapswitch' },
      p.on ? h('div', { className: 'mfa-gaplist', role: 'region', 'aria-label': 'API gaps' },
        h('p', null, 'Drawn against contract v1.3.0. A tag marks something the API cannot answer yet. The design document has each finding in full.'),
        h('ol', null, D.gaps.map(function (g) { return h('li', { key: g[0] }, h('b', null, g[0]), h('span', null, g[1])); }))) : null,
      h('button', { type: 'button', className: 'mfa-gapswitch__btn', 'aria-pressed': p.on ? 'true' : 'false', onClick: p.onToggle },
        p.on ? 'Hide API gaps' : 'Show API gaps'));
  }

  /* ---------- the app ---------- */

  function App() {
    var now = useNow(20000);
    var screen = useScreen();
    var gaps = useState(false);
    useEffect(function () { document.body.classList.toggle('mfa-gaps', gaps[0]); }, [gaps[0]]);

    var us = D.queue.filter(function (i) { return i.band === 'us'; }).sort(byAsked);
    var oldest = us[0];
    var tabs = [
      { label: 'Queue', href: '#queue', on: screen === 'queue',
        meta: oldest ? (oldest.bound ? '≤ ' : '') + ageShort(now - oldest.askedAt) : null,
        metaLabel: oldest ? 'oldest wait on us, ' + (oldest.bound ? 'up to ' : '') + ageLong(now - oldest.askedAt) : undefined },
      { label: 'Fleet', href: '#fleet', on: screen === 'fleet' },
      { label: 'Health', href: '#health', on: screen === 'health' }
    ];

    return h(React.Fragment, null,
      h(A.ConsoleBar, { tabs: tabs, user: D.admin }),
      h('main', { className: 'mfa-main' },
        screen === 'queue' ? h(Queue, { now: now }) : screen === 'fleet' ? h(Fleet, { now: now }) : h(Health, { now: now })),
      h(GapSwitch, { on: gaps[0], onToggle: function () { gaps[1](!gaps[0]); } }));
  }

  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
