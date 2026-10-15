/* The administrator's console — a clickable mockup. Composes window.Manifest (the shared
 * design system) and window.ManifestAdmin (its proposed additions) over window.ADMIN_DATA.
 * Nothing here calls an API: see the design document, §10, for what each screen needs.
 * Refreshed 2026-10-14 against contract 1.9.0: the queue is listQueue's kinds with recorded ages, the
 * Manifest team's step is a pane of its own, production runs sets of instances, incidents carry a cause,
 * and an event names who acted — and, for an administrator acting beyond their place, why. */
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

  var SCREENS = ['queue', 'fleet', 'health', 'settings'];
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
    { key: 'team', label: 'The team’s step', kinds: ['team'] },
    { key: 'ubc', label: 'With UBC', kinds: ['iam', 'pia'] },
    { key: 'requests', label: 'Domains, audiences, overrides', kinds: ['domain', 'audience', 'override'] }
  ];

  // A record the team submits leaves "Waiting on us" for "Waiting on UBC", from the moment it was
  // submitted — as listQueue answers it next (the team's kinds become iam-registration,
  // iam-change-request or privacy-assessment).
  function placed(it, ui) {
    var o = ui && ui.outcome;
    if (it.kind === 'team' && o && o.submitted) {
      return Object.assign({}, it, it.afterSubmit, {
        band: 'else', kind: it.recordKind === 'pia' ? 'pia' : 'iam', askedAt: o.at, moved: true,
        meta: [{ text: 'With ' + it.afterSubmit.holder, holder: true }, { text: 'submitted', mono: true }, { text: o.ticket, mono: true }]
      });
    }
    return it;
  }

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

    var all = D.queue.map(function (i) { return placed(i, ui[i.id]); }).sort(byAsked);
    var us = all.filter(function (i) { return i.band === 'us'; });
    var others = all.filter(function (i) { return i.band === 'else'; });
    var usV = us.filter(visible), othersV = others.filter(visible);
    var order = usV.concat(othersV).map(function (i) { return i.id; });
    var oldest = us[0];
    var item = all.filter(function (i) { return i.id === selected; })[0];

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
        // From OUR band's own ages: the queue's oldestSince counts what UBC holds too (A15).
        oldest: oldest ? { text: ageLong(now - oldest.askedAt), note: oldest.kindLabel + ', ' + oldest.project + '. Its age is when it was asked for.' } : null,
        people: unique(us.map(function (i) { return i.owner; })).length,
        items: all.length, itemsLabel: 'items · ' + us.length + ' on us, ' + others.length + ' with UBC',
        assembled: 'Read ' + (sinceRefresh < 15000 ? 'just now' : Math.round(sinceRefresh / 1000) + ' seconds ago') + ' · again every 60 seconds'
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
          band('Waiting on UBC', othersV, 'Shown, not headlined. Chasing UBC, and recording its answer, is still ours.')),
        h('section', { className: 'mfa-pane', id: 'pane', 'aria-label': 'The selected item' },
          item
            ? h(Pane, { key: item.id + (item.moved ? ':moved' : ''), item: item, now: now, ui: item.moved ? {} : (ui[item.id] || {}), patch: function (o) { patch(item.id, o); } })
            : sec(null, para('Choose an item to see what it asks, and decide it.')))));
  }

  /* ---------- the decision pane ---------- */

  function holderChip(it) {
    return h(M.StateChip, { state: 'waiting', pulse: false, label: it.band === 'us' ? 'Waiting on us' : 'With ' + it.holder });
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
        h('span', null, 'waiting ' + ageLong(now - it.askedAt))));
    var body;
    if (it.kind === 'approval') body = PaneApproval(p);
    else if (it.kind === 'team') body = PaneTeam(p);
    else if (it.kind === 'iam' || it.kind === 'pia') body = it.moved ? PaneMoved(p) : PaneRecord(p);
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
        hint: 'Approving: a reason is optional, and kept on the approval record. Rejecting: required, and ' + it.owner + ' reads it. Deciding a release is your own duty (§26), so it asks nothing more.',
        previews: [
          { label: 'If you approve', type: 'release.approved', lead: D.admin + ' approved this release for production.', reasonIn: 'record' },
          { label: 'If you reject', type: 'release.approval_rejected', lead: D.admin + ' did not approve this release:', reasonIn: 'sentence',
            after: 'A rejection is final for this release. ' + it.owner + ' also reads it on the launch checklist.' }
        ],
        previewIndex: ui.previewIdx || 0, onPreviewIndex: function (i) { patch({ previewIdx: i }); },
        actions: [
          { label: 'Approve for production', kind: 'primary', onClick: function () { patch({ stepUp: true }); } },
          { label: 'Reject', kind: 'ghostDanger', needsReason: true, onClick: function () { patch({ outcome: { decision: 'rejected', at: Date.now() } }); } }
        ],
        note: 'Approving asks you to sign in again.'
      });
    }

    return h(React.Fragment, null,
      sec('The request', h(React.Fragment, null,
        para(it.owner + ' asked ' + ageLong(now - it.askedAt) + ' ago for the release serving staging to be signed off for production.'),
        it.note ? h('blockquote', { className: 'mfa-quote' }, it.note) : null)),
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
        return h(A.EventLine, { key: i, when: ageShort(now - e.at) + ' ago', type: e.type, text: e.text, who: e.who, asAdmin: e.asAdmin, reason: e.reason });
      }))));
  }

  function PaneAgent(p) {
    var it = p.item, ui = p.ui, patch = p.patch, now = p.now, a = it.action, t = it.token;
    var stop = ui.outcome
      ? result('neutral', 'Refused for them', ['The agent was told no, in your words. ' + it.owner + ' reads “' + it.lead + ' ' + (ui.reason || '').trim() + '”, signed as a platform administrator.'], patch)
      : h(A.ObservedAction, {
        id: 'reason-' + it.id, owner: it.owner, reason: ui.reason, onReason: function (v) { patch({ reason: v }); },
        placeholder: 'What the agent should be told.',
        hint: 'Required. The agent receives it word for word, and ' + it.owner + ' reads it with your name, as a platform administrator (§26).',
        previews: [{ label: 'reject', type: 'pending_action.rejected', lead: it.lead, reasonIn: 'sentence', after: 'There is no Confirm here. Saying yes to someone else’s agent is theirs to do.' }],
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
          { label: 'Minted by', value: t.mintedBy + ' — named from the project’s members; the token records an id', gap: 'A8' }
        ]
      })),
      sec('Who decides', para(t.mintedBy + ', who minted the token, decides (§26). If it looks like a runaway agent, you can refuse it here; you cannot revoke someone else’s token.', 'A14')),
      sec('Refuse it instead', stop));
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
        { label: 'Submitted', value: ageLong(now - it.askedAt) + ' ago' + (r.submittedBy ? ', by ' + r.submittedBy : '') }
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
        owner: it.owner, canRecord: false, admissionLead: 'No reason is asked. ',
        admission: 'Recording UBC’s answer is an administrator’s own duty (§26), and the event names you.',
        previews: [{ label: 'record', type: it.preview.type, lead: fill(it.preview.lead, { ticket: ticket, state: next }) }],
        actions: [{ label: 'Record it', kind: 'primary', disabled: !ticket.trim(), onClick: function () { patch({ outcome: { at: Date.now() } }); } }],
        note: ticket.trim() ? null : 'A record needs the ticket reference, pasted in.'
      });

    return h(React.Fragment, null,
      sec('What is recorded', recordFacts(it, now)),
      sec('Record the next state', h(React.Fragment, null,
        para('Only the moves the platform allows from ' + it.record.state + ' are offered (launch/transitions.ts), so an impossible one cannot be asked for.'),
        it.next.some(function (n) { return n.gap; }) ? h('p', { className: 'mfa-sec__body', 'data-gap': 'A20' }, 'A change UBC granted is recorded in two moves: submitted, then active.') : null,
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

  /** A record the team has just submitted, now in "Waiting on UBC" (the mockup moves it, as the next read would). */
  function PaneMoved(p) {
    var it = p.item;
    return h(React.Fragment, null,
      sec('Where it is', para('Submitted to ' + it.holder + ' just now. It waits on UBC from today, and its answer is recorded here when it comes.')),
      sec(null, para('In the console the platform would answer this as a ' + (it.kind === 'pia' ? 'privacy-assessment' : it.change ? 'iam-change-request' : 'iam-registration') + ' item on the next read.')));
  }

  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayWords(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }); }

  /**
   * THE MANIFEST TEAM'S STEP (contract 1.8.0): a record its owner SENT to the team. Two decisions —
   * submit it to UBC with UBC's reference and the day it went, or hand it back, unsubmitted, to the state
   * it was sent from. A hand-back keeps no reason, so the console collects none (A19).
   */
  function PaneTeam(p) {
    var it = p.item, ui = p.ui, patch = p.patch, now = p.now, r = it.record;
    var ticket = ui.ticket || '';
    var sentOn = ui.sentOn || today();
    var future = sentOn > today();

    var sent;
    if (it.recordKind === 'pia') {
      sent = h(React.Fragment, null, r.sections.map(function (sct, i) {
        return h('div', { key: i, className: 'mfa-teamsec' },
          h('h4', { className: 'mfa-teamsec__title' }, sct.title),
          h(A.Tags, { items: sct.facts }),
          sct.gaps.map(function (g) {
            return h('div', { key: g.id, className: 'mfa-gap' },
              h('p', { className: 'mfa-gap__q' }, h('code', { className: 'mfa-mono' }, g.id), ' ', g.text),
              h('blockquote', { className: 'mfa-quote' }, g.answer));
          }));
      }));
    } else {
      sent = h(A.FactList, {
        rows: [
          { label: 'Entity ID', value: r.entityId, mono: true },
          { label: 'ACS URL', value: r.acsUrl, mono: true },
          r.cert ? { label: 'Certificate', value: h('span', null, h(A.MachineValue, { value: r.cert.fingerprint, label: 'certificate fingerprint', full: true }), ' · expires ' + day(r.cert.expires)) } : null,
          r.attributes ? { label: 'Attributes', value: h('ul', { className: 'mfa-attrs' }, r.attributes.map(function (a) {
            return h('li', { key: a.name },
              h('code', { className: 'mfa-mono' }, a.name), ' — ', a.purpose,
              a.used ? h('span', { className: 'mfa-attrs__used' }, ' · read at ' + a.used) : h('span', { className: 'mfa-flag' }, ' · never read by the code'));
          })) } : null,
          r.registered ? { label: 'Registered', value: h(A.Tags, { items: r.registered }) } : null,
          r.requested ? { label: 'Asks for', value: h(A.Tags, { items: r.requested.map(function (x) { return r.registered.indexOf(x) < 0 ? { text: x, add: true } : x; }) }) } : null,
          r.ticket ? { label: 'Live under', value: r.ticket, mono: true } : null
        ]
      });
    }

    var decide;
    if (ui.outcome && ui.outcome.returned) {
      decide = result('neutral', 'Handed back to ' + it.owner, ['It is back to ' + r.sentFrom + ', unsubmitted. ' + it.owner + ' reads “' + it.returnLead + '” — tell them why yourself.'], patch);
    } else {
      decide = h(A.ObservedAction, {
        owner: it.owner, canRecord: false,
        admissionLead: 'Manifest doesn’t keep a reason for a hand-back. ', admission: 'Tell ' + it.owner + ' why yourself.', admissionGap: 'A19',
        previews: [
          { label: it.change ? 'If you file it' : 'If you submit it', type: it.recordKind === 'pia' ? 'privacy_assessment.submitted' : 'iam_registration.submitted', lead: fill(it.submitLead, { ticket: ticket.trim(), day: dayWords(sentOn) }) },
          { label: 'If you hand it back', type: it.recordKind === 'pia' ? 'privacy_assessment.returned' : 'iam_registration.returned', lead: it.returnLead }
        ],
        previewIndex: ui.previewIdx || 0, onPreviewIndex: function (i) { patch({ previewIdx: i }); },
        actions: [
          { label: it.change ? 'File the change request' : 'Submit to ' + (it.recordKind === 'pia' ? 'the Privacy Office' : 'UBC IAM'), kind: 'primary', disabled: !ticket.trim() || future,
            onClick: function () { patch({ outcome: { submitted: true, at: Date.now(), ticket: ticket.trim() } }); } },
          { label: 'Hand it back', kind: 'secondary', onClick: function () { patch({ outcome: { returned: true, at: Date.now() } }); } }
        ],
        note: future ? 'It cannot have gone after today.' : ticket.trim() ? null : 'Submitting needs ' + (it.recordKind === 'pia' ? 'the PRISM reference' : 'UBC IAM’s ticket') + ', pasted in.'
      }, h('div', { className: 'mfa-row2' },
        h('div', { className: 'mfa-field' },
          h('label', { htmlFor: 'ticket-' + it.id }, it.ticketLabel),
          h('input', { id: 'ticket-' + it.id, value: ticket, placeholder: it.ticketPlaceholder, onChange: function (e) { patch({ ticket: e.target.value }); } })),
        h('div', { className: 'mfa-field' },
          h('label', { htmlFor: 'sent-' + it.id }, 'Sent to ' + it.to + ' on'),
          h('input', { id: 'sent-' + it.id, type: 'date', value: sentOn, max: today(), onChange: function (e) { patch({ sentOn: e.target.value }); } }))));
    }

    return h(React.Fragment, null,
      sec(it.change ? 'The change ' + r.sentBy + ' asked for' : 'What ' + r.sentBy + ' sent', h(React.Fragment, null,
        para('Sent to the Manifest team ' + ageLong(now - it.askedAt) + ' ago' + (it.change ? ', a change to the live registration. UBC’s registration stands until it answers.' : '.')),
        sent,
        r.warnings && r.warnings.length ? h('p', { className: 'mfa-flag' }, r.warnings.join(' ')) : null)),
      sec(it.change ? 'File it, or hand it back' : 'Submit it, or hand it back', decide));
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
        state: e.state, instances: e.instances, age: ageShort(now - e.deployAt),
        incident: e.incidentAt && e.incidentAt > e.deployAt ? ageShort(now - e.incidentAt) + ' ago'
          : e.exitStoppedAt ? ageShort(now - e.exitStoppedAt) + ' ago' : null
      } : null
    });
  }

  function Fleet(props) {
    var now = props.now;
    var query = useState(''), facets = useState({}), sort = useState({ key: 'deploy', dir: 'desc' }), open = useState(null);

    var FACETS = [
      { key: 'prod', label: 'In production', test: function (p) { return !!p.envs.production.state; } },
      { key: 'inc', label: 'Last attempt failed', test: function (p) { return ['sandbox', 'staging', 'production'].some(function (k) { var e = p.envs[k]; return e.incidentAt && e.incidentAt > e.deployAt; }); } },
      { key: 'old', label: 'Older blueprint', test: function (p) { return !!p.superseded; } },
      { key: 'arch', label: 'Archived', test: function (p) { return !!p.archivedAt; } }
    ];
    var rows = D.projects.filter(function (p) {
      if (FACETS.some(function (f) { return facets[0][f.key] && !f.test(p); })) return false;
      if (p.archivedAt && !facets[0].arch) return false;
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
        h('p', { className: 'mfa-lede', 'data-gap': 'A17' }, 'Every app on the platform, and how many instances each environment runs. An app’s data level, department, custom domains and this month’s AI spend are not in the fleet yet.')),
      h(A.FilterBar, {
        id: 'fleet-search', label: 'Filter the fleet', query: query[0], placeholder: 'Filter by app, owner or blueprint',
        onQuery: query[1],
        facets: FACETS.map(function (f) {
          return { label: f.label, on: !!facets[0][f.key], onToggle: function () { var n = Object.assign({}, facets[0]); n[f.key] = !n[f.key]; facets[1](n); } };
        }),
        onClear: function () { query[1](''); facets[1]({}); },
        count: rows.length + ' of ' + D.projects.length + ' apps' + (facets[0].arch ? '' : ' · archived hidden')
      }),
      h(A.DataTable, {
        caption: 'Every app on the platform', rowKey: 'slug', rows: rows, striped: true,
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
          { key: 'deploy', label: 'Last deploy', sortable: true, align: 'right', render: function (r) { return ageShort(now - lastDeploy(r)) + ' ago'; } }
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
    var question = D.agentQuestions[pr.slug];
    var qui = useState({});

    var envs = ['production', 'staging', 'sandbox'].map(function (k) {
      var e = pr.envs[k];
      if (!e.state) return h('div', { key: k, className: 'mfa-panel__line' },
        h('span', { className: 'mfa-over', style: { width: 88 } }, k), h(A.EnvCell, { env: null }));
      var failed = e.incidentAt && e.incidentAt > e.deployAt;
      var incident = inc.filter(function (i) { return i.env === k; })[0];
      if (incident && (incident.cause === 'exit' || incident.cause === 'exit_stopped')) {
        return h('div', { key: k },
          h(M.TwoFacts, {
            serving: { overline: 'Serving · ' + k, title: e.state + ' · ' + incident.serving, note: A.shorten(pr.digest), tone: 'steady' },
            attempt: { overline: (incident.cause === 'exit_stopped' ? 'Stopped, not replaced · ' : 'Stopped and replaced · ') + ageShort(now - incident.at) + ' ago', title: incident.exitReason, note: incident.sentence, tone: incident.cause === 'exit_stopped' ? 'attention' : 'neutral' },
            foot: null
          }));
      }
      if (failed && incident) {
        return h('div', { key: k },
          h(M.TwoFacts, {
            serving: { overline: 'Serving · ' + k, title: e.state + ' · ' + incident.serving, note: A.shorten(pr.digest), tone: 'steady' },
            attempt: { overline: 'Last attempt · ' + ageShort(now - e.incidentAt) + ' ago', title: 'failed: ' + incident.exitReason, note: incident.failedCheck, tone: 'attention' }
          }));
      }
      return h('div', { key: k, className: 'mfa-panel__line' },
        h('span', { className: 'mfa-over', style: { width: 88 } }, k),
        h(A.EnvCell, { env: { state: e.state, instances: e.instances, age: 'since ' + ageShort(now - e.deployAt) + ' ago' } }));
    });

    var events = [
      { at: lastDeploy(pr), type: 'instance.healthy', text: pr.slug + ' is running in ' + (pr.envs.production.state ? 'production' : 'staging') + '.' },
      { at: lastDeploy(pr) - 2 * MIN, type: 'instance.starting', text: pr.slug + ' is starting in ' + (pr.envs.production.state ? 'production' : 'staging') + '.' },
      { at: lastDeploy(pr) - 3 * MIN, type: 'instance.provisioning', text: 'Preparing ' + pr.slug + ' in ' + (pr.envs.production.state ? 'production' : 'staging') + '.' },
      { at: lastDeploy(pr) - 9 * MIN, type: 'build.succeeded', text: pr.slug + ' was built.' }
    ];
    inc.forEach(function (i) {
      events.unshift(i.cause === 'deploy'
        ? { at: i.at, type: 'instance.failed', text: pr.slug + ' failed to start in ' + i.env + '. The incident records what it printed and what changed since it last worked.' }
        : { at: i.at, type: 'instance.exited', text: i.sentence });
    });
    (D.adminEvents[pr.slug] || []).forEach(function (e) { events.push(e); });
    events.sort(function (a, b) { return b.at - a.at; });

    return h(React.Fragment, null,
      h('div', { className: 'mfa-scrim', onClick: p.onClose }),
      h('aside', { className: 'mfa-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drawer-title' },
        h('button', { type: 'button', ref: closeRef, className: 'mfa-iconbtn mfa-drawer__close', 'aria-label': 'Close', onClick: p.onClose }, A.icon(A.ICONS.CLOSE, 18)),
        h('header', { className: 'mfa-pane__head' },
          h('span', { className: 'mfa-over' }, 'App'),
          h('h2', { className: 'mfa-pane__ask', id: 'drawer-title', style: { fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: 0 } }, pr.slug),
          h('p', { className: 'mfa-pane__meta' },
            h('span', null, 'owned by ' + pr.owner), h('span', { className: 'mfa-mono' }, pr.audience),
            h('span', { 'data-gap': 'A17' }, h('span', { className: 'mfa-mono' }, pr.level), ' data'),
            pr.archivedAt ? h('span', { className: 'mfa-mono' }, 'archived ' + day(pr.archivedAt)) : null,
            h('span', null, 'created ' + day(pr.created)))),
        sec('Environments', h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } }, envs)),
        items.length ? sec('In the queue', h('ul', { className: 'mfa-events' }, items.map(function (q) {
          return h('li', { key: q.id, className: 'mfa-ev' },
            h('span', { className: 'mfa-ev__when' }, ageShort(now - q.askedAt)),
            h('span', { className: 'mfa-ev__body' },
              h('a', { href: '#queue', className: 'mfa-ev__text', onClick: function () { wantItem = q.id; } }, q.ask),
              h('span', { className: 'mfa-ev__type' }, q.kindLabel + (q.band === 'us' ? ' · on us' : ' · ' + q.holder))));
        }))) : null,
        question ? sec('An agent’s question', h(React.Fragment, null,
          h('p', { className: 'mfa-sec__body' }, h('strong', null, 'An agent asked to ' + question.action.summary + '.'), ' Waiting ' + ageLong(now - question.askedAt) + '.'),
          PaneAgent({ item: question, ui: qui[0], now: now, patch: function (o) { qui[1](Object.assign({}, qui[0], o)); } }))) : null,
        sec('Recent events', h('ul', { className: 'mfa-events' }, events.map(function (e, i) {
          return h(A.EventLine, { key: i, when: ageShort(now - e.at) + ' ago', type: e.type, text: e.text, who: e.who, asAdmin: e.asAdmin, reason: e.reason });
        }))),
        sec(null, para('An administrator sees everything here, and changes nothing from this page but an agent’s question. An owner’s action on someone else’s app — a deploy, a member, a secret, a commit — is taken in the reference console, with a reason the app’s people read.'))));
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
          title: 'Incidents, by cause', count: D.incidents.length,
          foot: 'Each environment’s incidents, newest first, read where the fleet says one happened. Nothing says whether one is still open.', footGap: 'A9'
        }, D.incidents.slice().sort(function (a, b) {
          var rank = { exit_stopped: 0, exit: 1, deploy: 2 };
          return rank[a.cause] - rank[b.cause] || b.at - a.at;
        }).map(function (i) {
          var stopped = i.cause === 'exit_stopped';
          return h('li', { key: i.project + i.env, className: 'mfa-panel__item' },
            h('div', { className: 'mfa-panel__line' },
              h('span', { className: 'mfa-mono', style: { fontWeight: 500 } }, i.project),
              h('span', { className: 'mfa-mono', style: { color: 'var(--ink-subtle)' } }, i.env),
              h('span', { style: { color: 'var(--ink-subtle)', fontSize: 12 } }, ageShort(now - i.at) + ' ago'),
              h(A.RawChip, { raw: i.cause, state: stopped ? 'attention' : i.cause === 'exit' ? 'waiting' : 'steady',
                label: stopped ? 'Stopped, not replaced' : i.cause === 'exit' ? 'Stopped and replaced' : 'Still serving ' + i.serving, pulse: false })),
            i.sentence ? h('span', { style: { fontSize: 13, color: stopped ? 'var(--attention-deep)' : 'var(--ink-muted)' } }, i.sentence) : null,
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
        h('p', null, 'Drawn against contract v1.3.0 and refreshed against v1.9.0 (2026-10-14). A tag marks something the API cannot answer yet. The design document’s §10 has each finding in full.'),
        h('ol', null, D.gaps.map(function (g) { return h('li', { key: g[0] }, h('b', null, g[0]), h('span', null, g[1])); }))) : null,
      h('button', { type: 'button', className: 'mfa-gapswitch__btn', 'aria-pressed': p.on ? 'true' : 'false', onClick: p.onToggle },
        p.on ? 'Hide API gaps' : 'Show API gaps'));
  }

  /* ---------- the app ---------- */

  /* ---------- Settings ---------- */

  var SET_SECTIONS = [
    { id: 'quotas', label: 'Quotas' },
    { id: 'models', label: 'AI models' },
    { id: 'blueprints', label: 'Blueprints' },
    { id: 'scanning', label: 'Security scanning' },
    { id: 'signin', label: 'Sign-in' },
    { id: 'source', label: 'Source code' },
    { id: 'addresses', label: 'Addresses' },
    { id: 'limits', label: 'Time limits' },
    { id: 'admins', label: 'Administrators' }
  ];

  var MODEL_LABELS = {
    'default-chat-onprem': 'Chat, kept on the host',
    'default-chat-onprem-reasoning': 'Chat with reasoning, kept on the host',
    'default-chat': 'Chat',
    'default-chat-reasoning': 'Chat with reasoning',
    'default-embed': 'Embeddings'
  };

  function setHead() {
    return h('div', { className: 'mfa-set__row mfa-set__row--head', 'aria-hidden': 'true' },
      h('span', null, 'Setting'), h('span', null, 'Value'), h('span', null, 'Set in'), h('span', null, ''));
  }
  function secret(set) {
    return h('span', { className: 'mfa-secret' + (set ? '' : ' mfa-secret--unset') }, set ? 'Set · never shown' : 'Not set');
  }
  function onHost(text) { return h('span', { className: 'mfa-set__host' }, text || 'On the host'); }
  function plain(text) { return h('span', { className: 'mfa-set__value--plain' }, text); }

  function Settings(props) {
    var now = props.now, S = D.settings;
    var vals = useState(function () {
      var v = {};
      S.quotas.forEach(function (q) { v[q.id] = q.value; });
      S.models.forEach(function (m) { v[m.name] = m.cleared; });
      return v;
    });
    var changed = useState({});
    var edit = useState(null);
    var at = useState('quotas');
    var refresh = useState(false);
    var e = edit[0];

    function setEdit(o) { edit[1](Object.assign({}, e, o)); }
    function apply() {
      var v = Object.assign({}, vals[0]); v[e.id] = e.draft.trim(); vals[1](v);
      var c = Object.assign({}, changed[0]); c[e.id] = Date.now(); changed[1](c);
      edit[1](null);
    }
    function go(id) {
      at[1](id);
      var el = document.getElementById('set-' + id);
      if (el) el.scrollIntoView({ block: 'start' });
    }
    function changedNote(id) {
      var t = changed[0][id];
      return t ? 'Changed ' + (now - t < MIN ? 'just now' : ageShort(now - t) + ' ago') + ' by ' + D.admin : null;
    }
    function changeButton(id, cur) {
      return e && e.id === id ? null : h(M.Button, {
        kind: 'secondary', size: 'sm', onClick: function () { edit[1]({ id: id, draft: cur, reason: '', stage: 'edit' }); }
      }, 'Change');
    }

    function editor(opts) {
      var cur = vals[0][e.id];
      var input = opts.options
        ? h('select', { id: 'edit-' + e.id, className: 'mfa-select', value: e.draft, onChange: function (ev) { setEdit({ draft: ev.target.value }); } },
          opts.options.map(function (o) { return h('option', { key: o, value: o }, o); }))
        : h('input', { id: 'edit-' + e.id, value: e.draft, onChange: function (ev) { setEdit({ draft: ev.target.value }); } });
      if (e.stage === 'stepup') {
        return h('div', { className: 'mfa-result mfa-result--stepup', role: 'status' },
          h('p', { className: 'mfa-result__title' }, 'Sign in again to change a quota'),
          h('p', { className: 'mfa-result__body' }, 'The platform answered ', h('code', { className: 'mfa-mono' }, 'STEP_UP_REQUIRED'),
            '. Changing a quota is one of the four actions that need a fresh CWL sign-in (§20). Nothing has changed yet.'),
          h('div', { className: 'mfa-obs__actions' },
            h(M.Button, { kind: 'primary', size: 'sm', onClick: apply }, 'Sign in with CWL'),
            h(M.Button, { kind: 'tertiary', size: 'sm', onClick: function () { setEdit({ stage: 'edit' }); } }, 'Not now')));
      }
      return h(React.Fragment, null,
        h('div', { className: 'mfa-field' }, h('label', { htmlFor: 'edit-' + e.id }, 'New value'), input),
        h(A.ObservedAction, {
          id: 'reason-set-' + e.id, owner: 'everyone', seeLabel: 'In the audit log',
          reason: e.reason, onReason: function (v) { setEdit({ reason: v }); },
          placeholder: 'Why the platform should change.',
          hint: opts.stepUp ? 'Required. Saving asks you to sign in again (§20).' : 'Required. It is kept with the change.',
          previews: [{
            label: 'change', type: opts.type, gap: 'A13', reasonIn: 'sentence', after: opts.after,
            lead: D.admin + ' changed ' + opts.what + ' from ' + opts.show(cur) + ' to ' + opts.show(e.draft.trim() || '…') + ':'
          }],
          actions: [
            { label: 'Save', kind: 'primary', needsReason: true, disabled: !e.draft.trim() || e.draft.trim() === cur,
              onClick: function () { if (opts.stepUp) setEdit({ stage: 'stepup' }); else apply(); } },
            { label: 'Cancel', kind: 'tertiary', onClick: function () { edit[1](null); } }
          ]
        }));
    }

    function section(id, title, note, rows, foot, gaps) {
      return h('section', { className: 'mfa-setsec', id: 'set-' + id, 'aria-labelledby': 'set-h-' + id },
        h('div', { className: 'mfa-setsec__head' },
          h('h2', { className: 'mfa-setsec__title', id: 'set-h-' + id, 'data-gap': gaps && gaps.title }, title),
          note ? h('p', { className: 'mfa-setsec__note' }, note) : null),
        rows,
        foot ? h('p', { className: 'mfa-setsec__foot', 'data-gap': gaps && gaps.foot }, foot) : null);
    }

    var built = S.vulnDbBuilt, staleAt = built + 7 * D.DAY;
    var daysLeft = Math.ceil((staleAt - now) / D.DAY);

    var quotas = section('quotas', 'Quotas for new apps',
      'The ceiling a new app is created with: what its manifest may ask for, and what its AI may spend in a month.',
      [setHead()].concat(S.quotas.map(function (q) {
        var editing = e && e.id === q.id;
        return h(A.SettingRow, {
          key: q.id, label: q.label, keyName: 'quota.' + q.id, value: q.show(vals[0][q.id]), changed: changedNote(q.id),
          source: 'Database default, projects.quota', action: changeButton(q.id, vals[0][q.id]), editing: editing,
          editor: editing ? editor({
            what: 'the default ' + q.label.toLowerCase(), show: q.show, stepUp: true, type: 'quota.changed',
            after: 'It applies to apps created from now on. An existing app keeps its own quota, and a validated manifest is never re-checked against a later one (§7).'
          }) : null
        });
      })),
      'One app’s own quota belongs on its page in the fleet. quota:set is a capability every administrator holds, and no operation uses it yet.',
      { title: 'A13', foot: 'A13' });

    var models = section('models', 'AI models',
      'The logical models an app may name in ai.models. Each is cleared for data up to its max_classification, and an app declaring more is refused when its manifest is validated (D17).',
      [setHead()].concat(S.models.map(function (m) {
        var editing = e && e.id === m.name;
        return h(A.SettingRow, {
          key: m.name, label: MODEL_LABELS[m.name], keyName: m.name,
          value: h(React.Fragment, null,
            h('span', null, 'max_classification: ' + vals[0][m.name]),
            h('span', { className: 'mfa-set__src' }, m.backing),
            h('span', { className: 'mfa-set__src' }, m.runs)),
          changed: changedNote(m.name),
          source: 'infra/litellm/config.yaml, read from LiteLLM', action: changeButton(m.name, vals[0][m.name]), editing: editing,
          editor: editing ? editor({
            what: m.name + '’s clearance', show: function (v) { return v; }, options: ['low', 'medium', 'high', 'very-high'], type: 'catalogue.changed',
            after: 'An app that declares more than this and names ' + m.name + ' is refused at its next validation. Nothing that is running changes.'
          }) : null
        });
      })),
      'An entry with no valid max_classification is never defaulted and never resolvable. No operation changes the catalogue yet: today it is a file on the host.',
      { title: 'A13', foot: 'A13' });

    var blueprints = section('blueprints', 'Blueprints',
      'What an app is built from: its Dockerfile, base image, skeleton and starters. A project pins one major version.',
      [setHead()].concat(S.blueprints.map(function (b) {
        return h(A.SettingRow, {
          key: b.ref, label: b.language, keyName: b.ref,
          value: h(React.Fragment, null,
            h(A.RawChip, { state: b.state === 'current' ? 'steady' : 'notyet', label: b.state === 'current' ? 'Current' : 'Superseded', raw: b.state }),
            h('span', { className: 'mfa-set__src' }, 'starters: ' + b.starters.join(', ') + ' · ' + plural(b.apps, 'app'))),
          source: 'This repository, blueprints/', action: onHost('A commit changes it')
        });
      })),
      'Read from listBlueprints. A blueprint is changed by a reviewed commit to this repository, never from a browser.');

    var scanning = section('scanning', 'Security scanning',
      'Every build is scanned. A clean result from a stale database is not evidence there is nothing to find (§12).',
      [setHead(),
        h(A.SettingRow, {
          key: 'db', label: 'Vulnerability database', keyName: 'manifest-grype-db',
          value: h(React.Fragment, null,
            h('span', null, 'built ' + new Date(built).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
            h(A.RawChip, daysLeft > 0
              ? { state: daysLeft <= 3 ? 'waiting' : 'steady', label: 'Fresh for ' + plural(daysLeft, 'more day'), raw: 'stale: false' }
              : { state: 'attention', label: 'Stale since ' + day(staleAt), raw: 'stale: true', pulse: false })),
          source: 'A Docker volume on the host',
          action: refresh[0] ? null : h(M.Button, { kind: 'secondary', size: 'sm', onClick: function () { refresh[1](true); } }, 'Refresh'),
          editing: refresh[0],
          editor: refresh[0] ? h('div', { className: 'mfa-admit', 'data-gap': 'A13' },
            h('strong', null, 'Manifest can’t refresh it from here yet. '),
            'It needs the network, and today it is ', h('code', { className: 'mfa-mono' }, 'make refresh-vulndb'),
            ' on the host. Refreshing it from the console is a plan already placed, after the authoring API. ',
            h('button', { type: 'button', className: 'mfa-filters__clear', onClick: function () { refresh[1](false); } }, 'Close')) : null
        }),
        h(A.SettingRow, { key: 'scanner', label: 'Scanner', keyName: 'grype', value: 'v0.118.0', source: 'infra/images.lock', action: onHost() }),
        h(A.SettingRow, {
          key: 'fresh', label: 'Fresh for', keyName: '§12', value: '7 days', source: 'Code',
          action: onHost('Not a setting'), changed: null
        })],
      'Past seven days a build still deploys to sandbox and staging with a warning, and every production launch is refused by §13’s scans item.');

    var signin = section('signin', 'Sign-in',
      'Who the platform asks when a person or an app signs in with CWL.',
      [setHead(),
        h(A.SettingRow, { key: 'idp', label: 'Identity provider', keyName: 'MANIFEST_IDP_BASE_URL', value: 'https://idp.manifest.internal', source: 'Environment, the default', action: onHost() }),
        h(A.SettingRow, {
          key: 'stg', label: 'UBC’s staging IdP', keyName: 'authentication.stg.id.ubc.ca',
          value: h(M.StateChip, { state: 'waiting', label: 'Waiting on UBC IAM', pulse: false }),
          source: 'The external track, item 5', action: onHost('Not requested yet')
        }),
        h(A.SettingRow, { key: 'ru', label: 'Rehearsal account', keyName: 'MANIFEST_REHEARSAL_USER', value: secret(true), source: 'Environment', action: onHost() }),
        h(A.SettingRow, { key: 'rp', label: 'Rehearsal password', keyName: 'MANIFEST_REHEARSAL_PASSWORD', value: secret(true), source: 'Environment', action: onHost() }),
        h(A.SettingRow, { key: 'sp', label: 'Service Provider entity base', keyName: 'MANIFEST_SP_ENTITY_BASE', value: 'https://manifest.internal', source: 'Environment, the default', action: onHost() })],
      'When UBC grants staging access, two of these change, the IdP’s address and the rehearsal account, and no code does. Today every rehearsal proves the shape of a registration, never UBC’s acceptance of it.');

    var source = section('source', 'Source code',
      'Where an app’s code lives. The driver is chosen when the control plane starts.',
      [setHead(),
        h(A.SettingRow, {
          key: 'drv', label: 'Driver', keyName: 'MANIFEST_SOURCE_DRIVER',
          value: h(React.Fragment, null, h('span', null, 'local'), h('span', { className: 'mfa-set__src' }, 'bare repositories on this host; the other is github')),
          source: 'Environment, the default', action: onHost('Restart to change')
        }),
        h(A.SettingRow, { key: 'org', label: 'GitHub organisation', keyName: 'MANIFEST_GITHUB_ORG', value: 'Manifest-local-dev', source: 'Environment', action: onHost() }),
        h(A.SettingRow, { key: 'app', label: 'GitHub App', keyName: 'MANIFEST_GITHUB_APP_ID', value: '5068172 · installation 164652178', source: 'Environment', action: onHost() }),
        h(A.SettingRow, { key: 'key', label: 'GitHub App private key', keyName: 'MANIFEST_GITHUB_APP_KEY', value: secret(true), source: 'infra/secrets/', action: onHost() }),
        h(A.SettingRow, { key: 'wh', label: 'Webhook secret', keyName: 'MANIFEST_GITHUB_WEBHOOK_SECRET', value: secret(true), source: 'Environment', action: onHost() })],
      'The github settings are used only when the driver is github. Switching drivers is a host decision: it changes where every new app’s code is kept.');

    var addresses = section('addresses', 'Addresses',
      'The zone each environment’s hostname is made in. A hostname is permanent once made (D26).',
      [setHead()].concat([['sandbox', 'sandbox.manifest.internal'], ['staging', 'staging.manifest.internal'], ['production', 'manifest.internal']].map(function (z) {
        return h(A.SettingRow, {
          key: z[0], label: z[0][0].toUpperCase() + z[0].slice(1), keyName: 'MANIFEST_ZONE_' + z[0].toUpperCase(),
          value: '<slug>.' + z[1], source: 'Environment, the default', action: onHost()
        });
      })),
      null);

    var limits = section('limits', 'Time limits',
      'How long the platform waits for things.',
      [setHead(),
        h(A.SettingRow, { key: 'ready', label: 'Waiting for an app to answer', keyName: 'MANIFEST_READINESS_TIMEOUT_MS', value: '90 seconds', source: 'Environment, the default', action: onHost() }),
        h(A.SettingRow, { key: 'drain', label: 'Draining an old version', keyName: 'MANIFEST_DRAIN_TIMEOUT_MS', value: '120 seconds', source: 'Environment, the default', action: onHost() }),
        h(A.SettingRow, { key: 'pa', label: 'An agent’s question lapses', keyName: 'PENDING_ACTION_TTL_MS', value: '24 hours', source: 'Code, tokens/pending.ts', action: onHost('Not a setting') }),
        h(A.SettingRow, { key: 'pv', label: 'An approval preview is valid', keyName: 'approval-preview', value: '30 minutes', source: 'Code', action: onHost('Not a setting') })],
      'Shown so an administrator knows the clocks the queue runs on. The last two are decisions, not settings.');

    var admins = section('admins', 'Administrators',
      'Who holds the platform administrator role.',
      h(A.DataTable, {
        caption: 'Platform administrators', rowKey: 'name', rows: S.admins, compact: true,
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'since', label: 'Since', render: function (r) { return day(r.since); } },
          { key: 'by', label: 'Granted by', render: function (r) { return h('span', { className: r.by.indexOf(':') > 0 ? 'mfa-mono' : undefined }, r.by); } },
          { key: 'reason', label: 'Reason', render: function (r) { return h('span', { style: { whiteSpace: 'normal', color: 'var(--ink-muted)' } }, r.reason); } }
        ]
      }),
      'Granted and revoked on the host by scripts/admin-grant.sh, which records who and why in audit.role_changes. The console shows the list and never grants the role: a stolen administrator’s session must not be able to make another administrator.',
      { title: 'A10', foot: 'A10' });

    return h(React.Fragment, null,
      h('div', { style: { marginBottom: 24 } },
        h('h1', { className: 'mfa-h1' }, 'Settings'),
        h('p', { className: 'mfa-lede' }, 'How the platform is configured, and where each value is set. You change here what an administrator should change from a browser. Everything else is shown here and changed on the host.')),
      h('div', { className: 'mfa-settings' },
        h('nav', { className: 'mfa-setidx', 'aria-label': 'Settings sections' }, SET_SECTIONS.map(function (s) {
          return h('button', { key: s.id, type: 'button', 'aria-current': at[0] === s.id ? 'true' : undefined, onClick: function () { go(s.id); } }, s.label);
        })),
        h('div', { className: 'mfa-setsecs' }, quotas, models, blueprints, scanning, signin, source, addresses, limits, admins)));
  }

  /* ---------- the app ---------- */

  function App() {
    var now = useNow(20000);
    var screen = useScreen();
    var gaps = useState(false);
    useEffect(function () { document.body.classList.toggle('mfa-gaps', gaps[0]); }, [gaps[0]]);

    return h('div', { className: 'mfa-shell' },
      h(A.ConsoleRail, {
        user: D.admin,
        items: [
          { label: 'Queue', href: '#queue', icon: 'queue', on: screen === 'queue' },
          { label: 'Fleet', href: '#fleet', icon: 'fleet', on: screen === 'fleet' },
          { label: 'Health', href: '#health', icon: 'health', on: screen === 'health' }
        ],
        footItems: [{ label: 'Settings', href: '#settings', icon: 'settings', on: screen === 'settings' }]
      }),
      h('div', { className: 'mfa-content' },
        h('main', { className: 'mfa-main' },
          screen === 'queue' ? h(Queue, { now: now })
            : screen === 'fleet' ? h(Fleet, { now: now })
              : screen === 'health' ? h(Health, { now: now })
                : h(Settings, { now: now }))),
      h(GapSwitch, { on: gaps[0], onToggle: function () { gaps[1](!gaps[0]); } }));
  }

  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
