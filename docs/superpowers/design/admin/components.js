/* Manifest — the operations surface's components, PROPOSED for bundle.js.
 *
 * Written in bundle.js's own idiom — React.createElement, no JSX, no build, stateless — and
 * styled only from tokens (components.css), so each can move into the shared bundle
 * unchanged once its design is agreed. Reads window.React and window.Manifest; assigns
 * window.ManifestAdmin. Load after bundle.js.
 */
(function (global) {
  'use strict';

  var React = global.React;
  var h = React.createElement;
  var M = global.Manifest;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i += 1) if (arguments[i]) out.push(arguments[i]);
    return out.join(' ');
  }

  function icon(d, size) {
    return h('svg', {
      width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': 'true', style: { flexShrink: 0 }
    }, d.map(function (p, i) { return h('path', { key: i, d: p }); }));
  }
  var COPY = ['M9 9h10v10H9z', 'M15 9V5H5v10h4'];
  var TICK = ['M5 13l4 4L19 7'];
  var SEARCH = ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-3.5-3.5'];
  var CLOSE = ['M6 6l12 12', 'M18 6L6 18'];

  /** The platform's enums, collapsed into the five states (20-states.md). */
  function stateOf(raw) {
    switch (raw) {
      case 'healthy': case 'succeeded': case 'active': case 'approved': case 'met': return 'steady';
      case 'pending': case 'building': case 'provisioning': case 'starting': case 'waking': case 'running': case 'destroying': return 'working';
      case 'failed': return 'attention';
      case 'hibernated': case 'not_built': case 'gone': return 'notyet';
      default: return 'waiting';
    }
  }

  function copyText(value, button) {
    function done() {
      if (!button) return;
      button.setAttribute('data-copied', 'true');
      setTimeout(function () { button.removeAttribute('data-copied'); }, 1400);
    }
    try {
      navigator.clipboard.writeText(value).then(done, function () { done(); });
    } catch (e) { done(); }
  }

  /** `sha256:9b2c1d0e…d3e4` — the prefix and the last four; the whole value on hover and focus. */
  function shorten(v) {
    var m = /^([a-z0-9]+:)?(.*)$/.exec(v);
    var pre = m[1] || '', rest = m[2];
    if (rest.length <= 18) return v;
    return pre + rest.slice(0, 8) + '…' + rest.slice(-4);
  }

  function MachineValue(props) {
    var v = props.value;
    var short = props.full ? v : shorten(v);
    return h('span', { className: cx('mfa-mv', props.className) },
      h('code', { className: 'mfa-mv__v', tabIndex: short === v ? undefined : 0, title: short === v ? undefined : v },
        h('span', { className: 'mfa-mv__short', 'aria-hidden': short === v ? undefined : 'true' }, short),
        short === v ? null : h('span', { className: 'mfa-mv__full' }, v),
        short === v ? null : h('span', { className: 'mfa-sr' }, v)),
      props.copy === false ? null : h('button', {
        type: 'button', className: 'mfa-mv__copy', 'aria-label': 'Copy ' + (props.label || 'value'),
        onClick: function (e) { copyText(v, e.currentTarget); }
      }, icon(COPY, 13)));
  }

  var RAIL_ICONS = {
    queue: ['M4 13h4.5l1.5 2.5h4l1.5-2.5H20', 'M6 5h12l2 8v6H4v-6z'],
    fleet: ['M4 4.5h6.5V11H4z', 'M13.5 4.5H20V11h-6.5z', 'M4 13.5h6.5V20H4z', 'M13.5 13.5H20V20h-6.5z'],
    health: ['M3 12.5h4l2.5-6 5 11 2.5-5H21'],
    settings: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9',
      'M15 5.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6', 'M9 15.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6']
  };

  function railItem(it) {
    return h('a', {
      key: it.label, href: it.href, className: cx('mf-rail__item', it.on && 'mf-rail__item--on'),
      'aria-current': it.on ? 'page' : undefined
    }, h('svg', {
      width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', style: { flexShrink: 0 }
    }, (RAIL_ICONS[it.icon] || []).map(function (d, i) { return h('path', { key: i, d: d }); })), it.label);
  }

  /**
   * SideNav's proposed sibling for the operations surface: the same rail — its classes, its
   * UBC blue, its three signals for the active item — carrying the console's screens, an
   * "Operations" overline that says which product this is, Settings above the person, and the
   * person's platform role, because anything done here may be done on someone else's project.
   */
  function ConsoleRail(props) {
    return h('nav', { className: cx('mf-rail', 'mfa-rail', props.className), 'aria-label': 'Manifest operations' },
      h('a', { className: 'mf-rail__mark', href: props.homeHref || '#queue' },
        h('span', { className: 'mf-rail__sq' },
          h('svg', {
            width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--nav-surface)',
            strokeWidth: 2.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true'
          }, h('path', { d: 'M4 19V9.5L12 4l8 5.5V19' }), h('path', { d: 'M9.5 19v-6h5v6' }))),
        h('span', { className: 'mf-rail__name' }, 'Manifest'),
        h('span', { className: 'mf-rail__bar' }),
        h('span', { className: 'mf-rail__org' }, 'UBC')),
      h('span', { className: 'mf-rail__over' }, props.product || 'Operations'),
      (props.items || []).map(railItem),
      h('div', { className: 'mfa-rail__spacer' }),
      (props.footItems || []).map(railItem),
      h('div', { className: 'mf-rail__foot' },
        h('span', { className: 'mf-rail__who' }, props.user),
        h('span', { className: 'mfa-rail__role' }, props.role || 'Platform administrator'),
        h('a', { className: 'mf-rail__out', href: props.signOutHref || '#' }, 'Sign out')));
  }

  /**
   * One setting: what it is, its key, its value, where it is set, and what you can do about it
   * here. `editor` renders beneath the row while it is being changed.
   */
  function SettingRow(props) {
    return h('div', { className: cx('mfa-set', props.editing && 'mfa-set--editing') },
      h('div', { className: 'mfa-set__row' },
        h('div', { className: 'mfa-set__what' },
          h('span', { className: 'mfa-set__label' }, props.label),
          props.keyName ? h('code', { className: 'mfa-set__key' }, props.keyName) : null),
        h('div', { className: 'mfa-set__value' }, props.value,
          props.changed ? h('span', { className: 'mfa-set__changed' }, props.changed) : null),
        h('div', { className: 'mfa-set__src' }, props.source),
        h('div', { className: 'mfa-set__act' }, props.action)),
      props.editor ? h('div', { className: 'mfa-set__editor' }, props.editor) : null);
  }

  /** The queue's headline: the oldest wait on us, the people waiting, then the count. */
  function WaitHeadline(props) {
    if (!props.oldest) {
      return h('section', { className: 'mfa-head mfa-head--empty', 'aria-label': 'Queue health' },
        h('div', { className: 'mfa-head__primary' },
          h('span', { className: 'mfa-over' }, 'Waiting on us'),
          h('div', { className: 'mfa-head__age' }, 'Nobody is waiting on us.')));
    }
    return h('section', { className: 'mfa-head', 'aria-label': 'Queue health' },
      h('div', { className: 'mfa-head__primary' },
        h('span', { className: 'mfa-over' }, 'Oldest waiting on us'),
        h('div', { className: 'mfa-head__age' },
          props.oldest.bound ? h('span', { className: 'mfa-head__upto' }, 'up to') : null,
          props.oldest.text),
        props.oldest.note ? h('p', { className: 'mfa-head__note', 'data-gap': props.oldest.gap }, props.oldest.note) : null),
      h('div', { className: 'mfa-head__stat' },
        h('span', { className: 'mfa-head__n' }, props.people),
        h('span', { className: 'mfa-head__l' }, props.people === 1 ? 'person waiting on an administrator' : 'people waiting on an administrator')),
      h('div', { className: 'mfa-head__stat mfa-head__stat--minor' },
        h('span', { className: 'mfa-head__n' }, props.items),
        h('span', { className: 'mfa-head__l' }, props.itemsLabel || 'items')),
      props.assembled ? h('p', { className: 'mfa-head__assembled', 'data-gap': props.assembledGap }, props.assembled) : null);
  }

  /** One queue item: age, kind, project, the ask, and a meta line that names who holds it. */
  function QueueRow(props) {
    var it = props.item;
    return h('li', { className: 'mfa-rows__item' },
      h('button', {
        type: 'button', className: cx('mfa-row', props.selected && 'mfa-row--on'),
        'aria-current': props.selected ? 'true' : undefined, onClick: props.onSelect, id: props.id
      },
        h('span', { className: 'mfa-row__age' },
          it.bound ? h('span', { className: 'mfa-row__upto' }, 'up to') : null,
          h('span', { className: 'mfa-row__agev' }, it.ageText)),
        h('span', { className: 'mfa-row__main' },
          h('span', { className: 'mfa-row__top' },
            h('span', { className: 'mfa-row__kind', 'data-gap': it.kindGap }, it.kindLabel),
            h('span', { className: 'mfa-row__slug' }, it.project)),
          h('span', { className: 'mfa-row__ask' }, it.ask),
          h('span', { className: 'mfa-row__meta' }, (it.meta || []).map(function (m, i) {
            return h('span', {
              key: i, 'data-gap': m.gap,
              className: cx('mfa-row__m', m.mono && 'mfa-row__m--mono', m.flag && 'mfa-row__m--flag', m.holder && 'mfa-row__m--holder')
            }, m.text);
          })))));
  }

  /** A dense definition list for a record's machine facts. */
  function FactList(props) {
    return h('dl', { className: 'mfa-facts' }, props.rows.filter(Boolean).map(function (r, i) {
      return h(React.Fragment, { key: i },
        h('dt', { 'data-gap': r.gap }, r.label),
        h('dd', { className: r.mono ? 'mfa-facts__mono' : undefined }, r.value));
    }));
  }

  function Tags(props) {
    return h('span', { className: 'mfa-tags' }, props.items.map(function (t, i) {
      var o = typeof t === 'string' ? { text: t } : t;
      return h('span', { key: i, className: cx('mfa-tag', o.add && 'mfa-tag--add', o.sens && 'mfa-tag--sens') }, (o.add ? '+ ' : '') + o.text);
    }));
  }

  /** A StateChip with the platform's own enum after the word: C3's inversion in one prop. */
  function RawChip(props) {
    return h('span', { className: 'mfa-rawchip' },
      h(M.StateChip, { state: props.state || stateOf(props.raw), label: props.label, pulse: props.pulse }),
      props.raw ? h('code', null, props.raw) : null);
  }

  /** An ApprovalDiff, read and never recomputed: changes, the platform's notes, the model's sentences. */
  function DiffView(props) {
    var d = props.diff;
    var sens = d.sensitiveFields || [];
    var noteFor = {};
    (d.security || []).forEach(function (s) { noteFor[s.field] = s.note; });
    var exposureFor = {};
    (d.summaryExposures || []).forEach(function (x) { exposureFor[x.path] = x.sentence; });

    function fieldOf(path) {
      for (var i = 0; i < sens.length; i += 1) if (path === sens[i] || path.indexOf(sens[i] + '.') === 0) return sens[i];
      return null;
    }

    var summary;
    if (d.summarySource === 'llm') {
      summary = h('div', { className: 'mfa-diff__summary' },
        h('span', { className: 'mfa-diff__who' }, 'Summary · written by a language model'),
        h('p', { className: 'mfa-diff__said' }, d.summary));
    } else if (d.summarySource === 'unavailable') {
      summary = h('div', { className: 'mfa-diff__summary' },
        h('span', { className: 'mfa-diff__who' }, 'Summary · unavailable'),
        h('p', { className: 'mfa-diff__said' }, 'The model didn’t answer. The diff above is the control, and it is complete.'));
    } else if (d.summarySource === 'no-previous-release') {
      summary = h('div', { className: 'mfa-diff__summary' },
        h('span', { className: 'mfa-diff__who' }, 'Summary · first launch'),
        h('p', { className: 'mfa-diff__said' }, 'Nothing earlier to compare with. What it runs, asks for and may use is below, and that is the whole of it.'));
    }

    return h('div', { className: 'mfa-diff' },
      d.baselineReleaseId || sens.length ? h('div', { className: 'mfa-diff__meta' },
        sens.length ? h('span', null, 'Re-escalated by') : null,
        sens.length ? h(Tags, { items: sens.map(function (s) { return { text: s, sens: true }; }) }) : null,
        d.baselineReleaseId ? h('span', null, 'compared with release') : null,
        d.baselineReleaseId ? h(MachineValue, { value: d.baselineReleaseId, label: 'baseline release id' }) : null) : null,

      (d.changes || []).map(function (c) {
        var f = fieldOf(c.path);
        return h('div', { key: c.path, className: 'mfa-diff__change' },
          h('div', { className: 'mfa-diff__path' }, c.path, f ? h(Tags, { items: [{ text: 'sensitive', sens: true }] }) : null),
          c.from !== undefined ? h('div', { className: 'mfa-diff__line mfa-diff__line--remove' },
            h('span', { className: 'mfa-diff__sign', 'aria-label': 'was' }, '−'), h('span', null, c.from)) : null,
          c.to !== undefined ? h('div', { className: 'mfa-diff__line mfa-diff__line--add' },
            h('span', { className: 'mfa-diff__sign', 'aria-label': 'becomes' }, '+'), h('span', null, c.to)) : null,
          f && noteFor[f] ? h('div', { className: 'mfa-diff__voice' },
            h('span', { className: 'mfa-diff__who' }, 'Manifest’s note on ' + f),
            h('p', { className: 'mfa-diff__said' }, noteFor[f])) : null,
          exposureFor[c.path] ? h('div', { className: 'mfa-diff__voice' },
            h('span', { className: 'mfa-diff__who' }, 'What it could expose · a language model'),
            h('p', { className: 'mfa-diff__said' }, exposureFor[c.path])) : null);
      }),

      summary,

      h(FactList, {
        rows: [
          { label: 'Services', value: h(Tags, { items: d.services }) },
          { label: 'CWL attributes', value: h(Tags, { items: d.attributes }) },
          { label: 'Production limits', value: d.resources.cpu + ' CPU · ' + d.resources.memory + ' · ' + d.resources.disk + ' disk · ' + d.resources.pids + ' processes', mono: true },
          { label: 'Code review', value: h('span', null, h('code', { className: 'mfa-mono' }, d.review.state), ' — ', d.review.detail) }
        ]
      }),
      d.coverage ? h('p', { className: 'mfa-diff__fine' }, d.coverage) : null);
  }

  /**
   * An administrator's decision, made to feel observed because it is: a reason, what the
   * owner will read in their own product, and the actions. Where the API stores no reason,
   * the field is replaced by an admission rather than collecting words that go nowhere.
   */
  function ObservedAction(props) {
    var previews = props.previews || [];
    var idx = Math.min(props.previewIndex || 0, Math.max(previews.length - 1, 0));
    var p = previews[idx];
    var reason = props.reason || '';
    var quote = reason.trim()
      ? h('blockquote', { className: 'mfa-quote' }, reason.trim())
      : h('blockquote', { className: 'mfa-quote mfa-quote--empty' }, 'Your words appear here.');

    return h('div', { className: 'mfa-obs' },
      h('div', { className: 'mfa-obs__write' },
        props.canRecord === false
          ? h('div', { className: 'mfa-admit', 'data-gap': props.admissionGap },
            h('strong', null, 'Manifest can’t record a reason here yet. '), props.admission)
          : h(React.Fragment, null,
            h('label', { className: 'mfa-obs__label', htmlFor: props.id }, 'Your reason'),
            h('textarea', {
              id: props.id, className: 'mfa-obs__input', rows: 4, value: reason,
              placeholder: props.placeholder,
              onChange: function (e) { props.onReason(e.target.value); }
            })),
        props.hint ? h('p', { className: 'mfa-obs__hint' }, props.hint) : null,
        props.children,
        h('div', { className: 'mfa-obs__actions' }, (props.actions || []).map(function (a) {
          return h(M.Button, {
            key: a.label, kind: a.kind || 'secondary', size: 'sm', onClick: a.onClick,
            disabled: a.disabled || (a.needsReason && !reason.trim())
          }, a.label);
        })),
        props.note ? h('p', { className: 'mfa-obs__hint' }, props.note) : null),

      p ? h('div', { className: 'mfa-obs__see', 'aria-live': 'polite' },
        h('div', { className: 'mfa-obs__seehead' },
          h('span', { className: 'mfa-over' }, props.seeLabel || 'In ' + props.owner + '’s activity'),
          previews.length > 1 ? h(M.SegmentedControl, {
            options: previews.map(function (x) { return x.label; }), value: p.label, role: 'tablist',
            onChange: function (v) { props.onPreviewIndex(previews.map(function (x) { return x.label; }).indexOf(v)); }
          }) : null),
        h('div', { className: 'mfa-obs__event' },
          h('span', { className: 'mfa-obs__when' }, 'just now · ' + p.type),
          h('p', { className: 'mfa-obs__sentence', 'data-gap': p.gap }, p.lead),
          p.reasonIn === 'sentence' ? quote : null),
        p.reasonIn === 'record' ? h(React.Fragment, null,
          h('p', { className: 'mfa-obs__after' }, 'Your reason is kept on the approval record, which ' + props.owner + ' can open:'),
          quote) : null,
        p.after ? h('p', { className: 'mfa-obs__after', 'data-gap': p.afterGap }, p.after) : null) : null);
  }

  /** One event: when · the sentence · its type. The faculty product needs this too. */
  function EventLine(props) {
    return h('li', { className: 'mfa-ev' },
      h('span', { className: 'mfa-ev__when' }, props.when),
      h('span', { className: 'mfa-ev__body' },
        h('span', { className: 'mfa-ev__text' }, props.text),
        h('span', { className: 'mfa-ev__type' }, props.type)));
  }

  /**
   * A real <table>: sortable headers with aria-sort, dense rows, a row that opens. `striped`
   * for a table that runs past a screen — the eye loses its row somewhere past a dozen — and
   * never for a short one, where stripes are only noise.
   */
  function DataTable(props) {
    var cols = props.columns;
    return h('div', { className: 'mfa-tablewrap' },
      h('table', { className: cx('mfa-table', props.striped && 'mfa-table--striped', props.compact && 'mfa-table--compact') },
        h('caption', { className: 'mfa-sr' }, props.caption),
        h('thead', null, h('tr', null, cols.map(function (c) {
          var on = props.sortKey === c.key;
          return h('th', {
            key: c.key, scope: 'col', className: c.align === 'right' ? 'mfa-num' : undefined,
            'aria-sort': c.sortable ? (on ? (props.sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined
          },
            c.sortable
              ? h('button', { type: 'button', className: 'mfa-th', onClick: function () { props.onSort(c.key); } },
                h('span', { 'data-gap': c.gap }, c.label),
                on ? h('span', { 'aria-hidden': 'true' }, props.sortDir === 'asc' ? '↑' : '↓') : null)
              : h('span', { 'data-gap': c.gap }, c.label));
        }))),
        h('tbody', null, props.rows.map(function (r) {
          return h('tr', {
            key: r[props.rowKey], className: props.onRow ? 'mfa-tr' : undefined,
            onClick: props.onRow ? function () { props.onRow(r); } : undefined
          }, cols.map(function (c) {
            return h('td', { key: c.key, className: cx(c.mono && 'mfa-mono', c.align === 'right' && 'mfa-num') },
              c.render ? c.render(r) : r[c.key]);
          }));
        }))));
  }

  /** Facets as toggles, a text filter, the count, and Clear. The state lives with the caller. */
  function FilterBar(props) {
    var anyOn = props.query || (props.facets || []).some(function (f) { return f.on; });
    return h('div', { className: 'mfa-filters', role: 'group', 'aria-label': props.label || 'Filters' },
      h('div', { className: 'mfa-search' },
        icon(SEARCH, 14),
        h('input', {
          id: props.id, type: 'search', value: props.query, placeholder: props.placeholder,
          'aria-label': props.placeholder, onChange: function (e) { props.onQuery(e.target.value); }
        })),
      (props.facets || []).map(function (f) {
        return h('button', {
          key: f.label, type: 'button', className: 'mfa-facet', 'aria-pressed': f.on ? 'true' : 'false',
          onClick: f.onToggle
        }, f.label);
      }),
      anyOn ? h('button', { type: 'button', className: 'mfa-filters__clear', onClick: props.onClear }, 'Clear') : null,
      h('span', { className: 'mfa-filters__count', 'aria-live': 'polite' }, props.count));
  }

  /** One environment in a fleet row: the serving state, its raw enum, the deploy's age, and an incident after it. */
  function EnvCell(props) {
    var e = props.env;
    if (!e || !e.state) return h('span', { className: 'mfa-env mfa-env--none' }, h('span', { className: 'mfa-env__dot' }), 'not deployed');
    return h('span', { className: 'mfa-env mfa-env--' + stateOf(e.state) },
      h('span', { className: 'mfa-env__dot', 'aria-hidden': 'true' }),
      e.state,
      e.age ? h('span', { className: 'mfa-env__age' }, e.age) : null,
      e.incident ? h('span', { className: 'mfa-env__inc' }, 'failed ' + e.incident) : null);
  }

  global.ManifestAdmin = {
    stateOf: stateOf, shorten: shorten, icon: icon, ICONS: { TICK: TICK, CLOSE: CLOSE, COPY: COPY, SEARCH: SEARCH },
    MachineValue: MachineValue, ConsoleRail: ConsoleRail, SettingRow: SettingRow, WaitHeadline: WaitHeadline, QueueRow: QueueRow,
    FactList: FactList, Tags: Tags, RawChip: RawChip, DiffView: DiffView, ObservedAction: ObservedAction,
    EventLine: EventLine, DataTable: DataTable, FilterBar: FilterBar, EnvCell: EnvCell
  };
})(window);
