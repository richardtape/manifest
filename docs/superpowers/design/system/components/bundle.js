/* @ds-bundle: {"format":4,"namespace":"Manifest","components":[{"name":"StateChip"},{"name":"LiveSteps"},{"name":"Timeline"},{"name":"ProgressBar"},{"name":"TwoFacts"},{"name":"ClockItem"},{"name":"Button"},{"name":"Card"},{"name":"FormField"},{"name":"SideNav"},{"name":"AppBar"},{"name":"ProjectBar"},{"name":"InverseSurface"},{"name":"LogPane"},{"name":"BrowserFrame"},{"name":"SegmentedControl"},{"name":"Choice"},{"name":"LockedRow"}]} */
(function (global) {
  'use strict';

  var React = global.React;
  var h = React.createElement;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i += 1) {
      if (arguments[i]) out.push(arguments[i]);
    }
    return out.join(' ');
  }

  function icon(d, size, stroke, width) {
    return h('svg', {
      width: size || 16, height: size || 16, viewBox: '0 0 24 24', fill: 'none',
      stroke: stroke || 'currentColor', strokeWidth: width || 2,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
      style: { flexShrink: 0 }
    }, d.map(function (p, i) { return h('path', { key: i, d: p }); }));
  }

  var TICK = ['M5 13l4 4L19 7'];
  var LOCK_BODY = { x: 4, y: 10, width: 16, height: 10, rx: 2 };

  function lockIcon(size, stroke) {
    return h('svg', {
      width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none',
      stroke: stroke || 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
      'aria-hidden': 'true', style: { flexShrink: 0 }
    }, h('rect', LOCK_BODY), h('path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' }));
  }

  /* ---- StateChip ------------------------------------------------------- */

  var STATES = ['working', 'waiting', 'attention', 'steady', 'notyet'];

  function StateChip(props) {
    var state = STATES.indexOf(props.state) === -1 ? 'notyet' : props.state;
    var pulse = props.pulse === undefined
      ? (state === 'working' || state === 'attention')
      : props.pulse;
    return h('span', { className: cx('mf-chip', 'mf-is-' + state, props.className) },
      h('span', { className: cx('mf-chip__dot', pulse && 'mf-pulse') }),
      props.label);
  }

  /* ---- LiveSteps ------------------------------------------------------- */

  function LiveSteps(props) {
    var steps = props.steps || [];
    return h('ol', { className: cx('mf-steps', props.className), style: { listStyle: 'none', margin: 0, padding: 0 } },
      steps.map(function (s, i) {
        var state = s.state || 'next';
        return h('li', {
          key: i,
          className: cx('mf-step', 'mf-step--' + state),
          'aria-current': state === 'now' ? 'step' : undefined
        },
          h('span', { className: cx('mf-step__mark', 'mf-step__mark--' + state, state === 'now' && 'mf-pulse') },
            state === 'done' ? icon(TICK, 11, 'var(--ink-inverse-strong)', 3.4) : null),
          h('span', null,
            h('span', { className: 'mf-step__text' }, s.text),
            s.note ? h('span', { className: 'mf-step__note', style: { display: 'block' } }, s.note) : null));
      }));
  }

  /* ---- Timeline -------------------------------------------------------- */

  function Timeline(props) {
    var stations = props.stations || [];
    var last = stations.length - 1;
    return h('ol', { className: cx('mf-timeline', props.className), style: { listStyle: 'none', margin: 0, padding: 0 } },
      stations.map(function (s, i) {
        var state = s.state || 'next';
        var before = i === 0 ? 'none' : (state === 'done' || state === 'now' || state === 'halted' ? 'on' : 'off');
        var after = i === last || state === 'halted' ? 'none' : (state === 'done' ? 'on' : 'off');
        return h('li', {
          key: i,
          className: cx('mf-station', 'mf-station--' + state),
          'aria-current': state === 'now' ? 'step' : undefined
        },
          h('span', { className: 'mf-station__rail' },
            h('span', { className: 'mf-station__line mf-station__line--' + before }),
            h('span', { className: cx('mf-station__dot', 'mf-station__dot--' + state, state === 'now' && 'mf-pulse') }),
            h('span', { className: 'mf-station__line mf-station__line--' + after })),
          h('span', { className: 'mf-station__label' }, s.label),
          s.note ? h('span', { className: 'mf-station__note' }, s.note) : null);
      }));
  }

  /* ---- ProgressBar ----------------------------------------------------- */

  function ProgressBar(props) {
    var kind = props.kind || 'working';
    if (kind === 'clock') {
      return h('div', { className: props.className },
        h('div', { className: 'mf-clock' }),
        h('div', { className: 'mf-bar__meta', style: { color: 'var(--waiting)' } },
          h('span', null, props.label || 'Nothing counting yet'),
          h('span', { style: { fontWeight: 600 } }, props.meta || 'Takes weeks')));
    }
    var pct = Math.max(0, Math.min(100, props.value === undefined ? 100 : props.value));
    return h('div', { className: props.className },
      h('div', {
        className: 'mf-bar', role: 'progressbar',
        'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100,
        'aria-label': props.label
      }, h('div', { className: 'mf-bar__fill mf-bar__fill--' + kind, style: { width: pct + '%' } })),
      (props.label || props.meta) ? h('div', { className: 'mf-bar__meta' },
        h('span', { style: { fontWeight: 600, color: kind === 'done' ? 'var(--steady)' : 'var(--working-deep)' } }, props.label),
        h('span', { style: { color: 'var(--ink-subtle)' } }, props.meta)) : null);
  }

  /* ---- TwoFacts -------------------------------------------------------- */

  var TONE = {
    steady: { bg: 'var(--steady-tint)', bd: 'var(--steady-border)', fg: 'var(--steady)', note: 'var(--steady-muted)' },
    attention: { bg: 'var(--attention-tint)', bd: 'var(--attention-border)', fg: 'var(--attention)', note: 'var(--attention-muted)' },
    working: { bg: 'var(--working-tint)', bd: 'var(--working-border)', fg: 'var(--working-deep)', note: 'var(--working-deep)' },
    neutral: { bg: 'var(--surface-sunken)', bd: 'var(--border-subtle)', fg: 'var(--ink-subtle)', note: 'var(--ink-muted)' }
  };

  function fact(f, fallbackTone, key) {
    var t = TONE[f.tone || fallbackTone] || TONE.neutral;
    return h('div', { key: key, className: 'mf-fact', style: { background: t.bg, border: '1px solid ' + t.bd } },
      h('span', { className: 'mf-overline', style: { color: t.fg } }, f.overline),
      h('span', { className: 'mf-fact__title' }, f.title),
      f.note ? h('span', { className: 'mf-fact__note', style: { color: t.note } }, f.note) : null);
  }

  function TwoFacts(props) {
    return h('div', { className: props.className },
      h('div', { className: 'mf-facts' },
        fact(props.serving || {}, 'steady', 'a'),
        fact(props.attempt || {}, 'neutral', 'b')),
      props.foot === null ? null : h('p', { className: 'mf-facts__foot' },
        props.foot || 'Two facts, not one. The older version keeps answering until a new one proves it can.'));
  }

  /* ---- ClockItem ------------------------------------------------------- */

  function ClockItem(props) {
    return h('div', { className: cx('mf-clockitem', props.className) },
      h('div', { className: 'mf-clockitem__top' },
        h('h3', { className: 'mf-clockitem__title' }, props.title),
        h(StateChip, { state: 'waiting', label: props.chip || 'Not started', pulse: false })),
      h('p', { className: 'mf-clockitem__body' }, props.body),
      h(ProgressBar, { kind: 'clock', label: props.clockLabel, meta: props.clockMeta }),
      props.admissionTitle ? h('div', { className: 'mf-admit' },
        h('span', { className: 'mf-admit__title' }, props.admissionTitle),
        h('p', { className: 'mf-admit__body' }, props.admissionBody)) : null,
      props.action ? h(Button, { kind: 'primary', href: props.actionHref || '#', style: { width: '100%' } }, props.action) : null);
  }

  /* ---- Button ---------------------------------------------------------- */

  function Button(props) {
    var kind = props.kind || 'primary';
    var tag = props.href ? 'a' : 'button';
    var attrs = {
      className: cx('mf-btn', 'mf-btn--' + kind, props.size === 'sm' && 'mf-btn--sm', props.className),
      style: props.style,
      onClick: props.onClick
    };
    if (props.href) attrs.href = props.href;
    else { attrs.type = props.type || 'button'; attrs.disabled = props.disabled; }
    return h(tag, attrs, props.children);
  }

  /* ---- Card ------------------------------------------------------------ */

  function Card(props) {
    var tone = props.tone || 'plain';
    return h('div', { className: cx('mf-card', tone !== 'plain' && 'mf-card--' + tone, props.className), style: props.style },
      props.title ? h('h3', { className: 'mf-card__title' }, props.title) : null,
      props.children);
  }

  /* ---- FormField ------------------------------------------------------- */

  function FormField(props) {
    var id = props.id || 'mf-field';
    var msg = props.message;
    var t = msg ? (TONE[msg.tone] || TONE.neutral) : null;
    return h('div', { className: cx('mf-field', props.className) },
      h('label', { className: 'mf-field__label', htmlFor: id }, props.label),
      props.hint ? h('p', { className: 'mf-field__hint' }, props.hint) : null,
      h('input', {
        id: id, type: 'text', className: cx('mf-field__input', props.mono && 'mf-field__input--mono'),
        value: props.value, onChange: props.onChange, placeholder: props.placeholder,
        'aria-describedby': msg ? id + '-msg' : undefined, readOnly: !props.onChange
      }),
      msg ? h('div', {
        id: id + '-msg', className: 'mf-msg', role: 'status',
        style: { background: t.bg, border: '1px solid ' + t.bd, alignItems: msg.body ? 'flex-start' : 'center' }
      },
        msg.tone === 'steady'
          ? icon(TICK, 17, 'var(--steady)', 2.2)
          : icon(['M12 7v6', 'M12 16.5v.01'], 17, 'var(--attention)', 2),
        h('div', null,
          h('p', { className: 'mf-msg__title', style: { color: t.fg } }, msg.title),
          msg.body ? h('p', { className: 'mf-msg__body', style: { color: t.note } }, msg.body) : null)) : null);
  }

  /* ---- SideNav --------------------------------------------------------- */

  var NAV_ICONS = {
    apps: ['M4 4.5h6.5V11H4z', 'M13.5 4.5H20V11h-6.5z', 'M4 13.5h6.5V20H4z', 'M13.5 13.5H20V20h-6.5z'],
    overview: ['M12 4l8 4.5-8 4.5-8-4.5z', 'M4 14l8 4.5 8-4.5'],
    preview: ['M3.5 5.5h17v10.5h-17z', 'M9 20h6', 'M12 16v4'],
    talk: ['M4.5 5.5h15v9.5h-9l-6 4.5z'],
    live: ['M6.5 20.5V4', 'M6.5 4.5h11l-2 3.5 2 3.5h-11'],
    people: ['M4 20a5 5 0 0 1 9.5 0', 'M8.75 11.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2', 'M16.5 20a5 5 0 0 0-2.6-4.4'],
    agent: ['M13.5 3.5L6 14h5.5l-1 6.5L18 10h-5.5z'],
    plus: ['M12 5.5v13', 'M5.5 12h13']
  };

  function navItem(it, active, key) {
    var on = it.label === active;
    var paths = NAV_ICONS[it.icon] || NAV_ICONS.overview;
    return h('a', {
      key: key, href: it.href || '#',
      className: cx('mf-rail__item', on && 'mf-rail__item--on'),
      'aria-current': on ? 'page' : undefined
    },
      h('svg', {
        width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', style: { flexShrink: 0 }
      }, paths.map(function (d, i) { return h('path', { key: i, d: d }); })),
      it.label);
  }

  function SideNav(props) {
    var items = props.items || [];
    return h('nav', { className: cx('mf-rail', props.className), 'aria-label': props.name || 'Manifest', style: props.style },
      h('a', { className: 'mf-rail__mark', href: props.homeHref || '#' },
        h('span', { className: 'mf-rail__sq' },
          h('svg', {
            width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--nav-surface)',
            strokeWidth: 2.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true'
          }, h('path', { d: 'M4 19V9.5L12 4l8 5.5V19' }), h('path', { d: 'M9.5 19v-6h5v6' }))),
        h('span', { className: 'mf-rail__name' }, props.name || 'Manifest'),
        h('span', { className: 'mf-rail__bar' }),
        h('span', { className: 'mf-rail__org' }, props.org || 'UBC')),

      navItem({ label: props.homeLabel || 'Your apps', href: props.homeHref || '#', icon: 'apps' }, props.active, 'home'),
      props.newLabel === null ? null
        : navItem({ label: props.newLabel || 'Start something new', href: props.newHref || '#', icon: 'plus' }, props.active, 'new'),

      items.length ? h('div', { className: 'mf-rail__rule' }) : null,
      items.length && props.projectName ? h('span', { className: 'mf-rail__over' }, props.projectName) : null,
      items.map(function (it, i) { return navItem(it, props.active, i); }),

      h('div', { style: { flexGrow: 1 } }),
      props.user ? h('div', { className: 'mf-rail__foot' },
        h('span', { className: 'mf-rail__who' }, props.user),
        h('a', { className: 'mf-rail__out', href: props.signOutHref || '#' }, 'Sign out')) : null);
  }

  /* ---- AppBar / ProjectBar --------------------------------------------- */

  function Mark(props) {
    return h('a', { className: 'mf-mark', href: props.href || '#' },
      h('span', { className: 'mf-mark__sq' },
        h('svg', {
          width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'var(--ink-inverse-strong)', strokeWidth: 2.3,
          strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true'
        }, h('path', { d: 'M4 19V9.5L12 4l8 5.5V19' }), h('path', { d: 'M9.5 19v-6h5v6' }))),
      h('span', { className: 'mf-mark__name' }, props.name || 'Manifest'),
      h('span', { className: 'mf-mark__rule' }),
      h('span', { className: 'mf-mark__org' }, props.org || 'UBC'));
  }

  function AppBar(props) {
    return h('header', { className: cx('mf-appbar', props.className) },
      h(Mark, { name: props.name, org: props.org }),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 22, fontSize: 13, color: 'var(--ink-secondary)' } },
        props.user ? h('span', null, props.user) : null,
        props.children));
  }

  function ProjectBar(props) {
    var tabs = props.tabs || [];
    return h('div', { className: cx('mf-projbar', props.className) },
      h('h1', { className: 'mf-projbar__title' }, props.title),
      props.meta ? h('p', { className: 'mf-projbar__meta' }, props.meta) : null,
      h('nav', { className: 'mf-projbar__nav' }, tabs.map(function (t, i) {
        var label = typeof t === 'string' ? t : t.label;
        return h('a', {
          key: i, href: (t && t.href) || '#',
          className: cx('mf-tab', label === props.active && 'mf-tab--on'),
          'aria-current': label === props.active ? 'page' : undefined
        }, label);
      })));
  }

  /* ---- InverseSurface / LogPane ---------------------------------------- */

  function InverseSurface(props) {
    return h('div', { className: cx('mf-inverse', props.className), style: props.style },
      props.title ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        props.warn ? icon(['M12 4l9 16H3z', 'M12 10v4', 'M12 17v.01'], 18, 'var(--warning-mark)', 2) : null,
        h('h3', { className: 'mf-inverse__title' }, props.title)) : null,
      props.body ? h('p', { className: 'mf-inverse__body' }, props.body) : null,
      props.inset ? h('div', { className: 'mf-inverse__inset' }, props.inset) : null,
      props.children);
  }

  function LogPane(props) {
    var lines = props.lines || [];
    var written = props.writtenBefore === undefined ? 0 : props.writtenBefore;
    return h('div', { className: cx('mf-log', props.className), style: props.style },
      lines.map(function (text, i) {
        return h('div', { key: i, className: i < written ? 'mf-log__line--old' : undefined },
          h('span', { className: 'mf-log__num' }, String(i + 1).padStart(3, ' ') + '  '), text);
      }));
  }

  /* ---- BrowserFrame ---------------------------------------------------- */

  function BrowserFrame(props) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: props.phone ? 0 : 1 } },
      h('div', {
        className: cx('mf-frame', props.phone && 'mf-frame--phone', props.className),
        style: props.style
      },
        h('div', { className: 'mf-frame__bar' },
          props.phone ? null : h('span', { className: 'mf-frame__dots' },
            h('span', { className: 'mf-frame__dot' }), h('span', { className: 'mf-frame__dot' }), h('span', { className: 'mf-frame__dot' })),
          h('span', { className: 'mf-frame__url' },
            props.secure === false ? null : lockIcon(11, 'var(--steady)'),
            props.url)),
        h('div', { className: 'mf-frame__body' }, props.children)),
      props.caption ? h('p', { className: 'mf-frame__caption' }, props.caption) : null);
  }

  /* ---- SegmentedControl ------------------------------------------------ */

  function SegmentedControl(props) {
    var options = props.options || [];
    return h('div', { className: cx('mf-seg', props.className), role: props.role || 'tablist' },
      options.map(function (o, i) {
        var value = typeof o === 'string' ? o : o.value;
        var label = typeof o === 'string' ? o : o.label;
        var on = value === props.value;
        return h('button', {
          key: i, type: 'button', role: props.role === 'radiogroup' ? 'radio' : 'tab',
          className: cx('mf-seg__tab', on && 'mf-seg__tab--on'),
          'aria-selected': props.role === 'radiogroup' ? undefined : on,
          'aria-checked': props.role === 'radiogroup' ? on : undefined,
          onClick: function () { if (props.onChange) props.onChange(value); }
        }, label);
      }));
  }

  /* ---- Choice / LockedRow ---------------------------------------------- */

  function Choice(props) {
    var type = props.type === 'checkbox' ? 'checkbox' : 'radio';
    var options = props.options || [];
    return h('div', { className: cx('mf-choices', props.className), role: type === 'radio' ? 'radiogroup' : 'group', 'aria-label': props.label },
      options.map(function (o, i) {
        var on = type === 'radio' ? o.value === props.value : !!o.checked;
        return h('label', { key: i, className: cx('mf-choice', on && 'mf-choice--on') },
          h('input', {
            type: type, name: props.name, checked: on,
            onChange: function () { if (props.onChange) props.onChange(o.value); }
          }),
          h('span', null,
            h('span', { className: 'mf-choice__title', style: { display: 'block' } }, o.title),
            o.note ? h('span', { className: 'mf-choice__note', style: { display: 'block' } }, o.note) : null));
      }));
  }

  function LockedRow(props) {
    return h('div', { className: cx('mf-locked', props.className) },
      lockIcon(14),
      props.children || props.label);
  }

  global.Manifest = {
    StateChip: StateChip, LiveSteps: LiveSteps, Timeline: Timeline, ProgressBar: ProgressBar,
    TwoFacts: TwoFacts, ClockItem: ClockItem, Button: Button, Card: Card, FormField: FormField,
    SideNav: SideNav, AppBar: AppBar, ProjectBar: ProjectBar, InverseSurface: InverseSurface, LogPane: LogPane,
    BrowserFrame: BrowserFrame,
    SegmentedControl: SegmentedControl, Choice: Choice, LockedRow: LockedRow
  };
})(window);
