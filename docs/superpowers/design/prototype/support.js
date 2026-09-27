/*
 * support.js — a small local runtime for the .dc.html prototype screens.
 *
 * The screens are authored in the Design-canvas component format, whose real
 * runtime lives in the canvas that hosts them and is not part of this
 * repository. This file implements just enough of that format to render the
 * seventeen screens from a file:// URL, so the prototype can be read and
 * clicked without any server, build step or network.
 *
 * It is a VIEWER, not a reimplementation of the canvas. If the two ever
 * disagree, the canvas is right. What it supports is exactly what these
 * screens use:
 *
 *   {{dotted.path}}          in text, and in any attribute
 *   <sc-for list as>         repeat, with {{$index}} in scope
 *   <sc-if value>            branch
 *   onClick / onInput / onChange   bound from a function the screen returns
 *   ref                      called with the element
 *   class Component extends DCLogic   with state, setState, renderVals and
 *                            componentDidMount / DidUpdate / WillUnmount
 *
 * Rendering is a full re-render on every setState: clone the original markup,
 * substitute, swap it in. That is fine at this size and keeps the code honest.
 */
(function (global) {
  'use strict';

  var HOLE = /\{\{([^}]+)\}\}/g;
  var WHOLE = /^\s*\{\{([^}]+)\}\}\s*$/;

  /** Look up a dotted path in a scope. Literals `true`/`false`/numbers pass through. */
  function resolve(path, scope) {
    var p = String(path).trim();
    if (p === 'true') return true;
    if (p === 'false') return false;
    if (p === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(p)) return Number(p);
    var parts = p.split('.');
    var v = scope ? scope[parts[0]] : undefined;
    for (var i = 1; i < parts.length; i += 1) {
      if (v === null || v === undefined) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  /**
   * A string that is exactly one hole returns the RAW value (a function, an
   * array, a boolean). Anything else is string interpolation.
   */
  function interpolate(str, scope) {
    var m = WHOLE.exec(str);
    if (m) return resolve(m[1], scope);
    return String(str).replace(HOLE, function (_, path) {
      var v = resolve(path, scope);
      return v === null || v === undefined ? '' : String(v);
    });
  }

  global.__dcRuntime = { resolve: resolve, interpolate: interpolate };

  if (typeof document === 'undefined') return;

  var EVENTS = { onclick: 'click', oninput: 'input', onchange: 'change', onsubmit: 'submit' };

  function text(v) { return v === null || v === undefined ? '' : String(v); }

  function bindAttrs(el, scope, refs) {
    var attrs = Array.prototype.slice.call(el.attributes);
    for (var i = 0; i < attrs.length; i += 1) {
      var name = attrs[i].name;
      var raw = attrs[i].value;

      if (name.indexOf('hint-') === 0) { el.removeAttribute(name); continue; }
      if (raw.indexOf('{{') === -1) continue;

      var val = interpolate(raw, scope);

      if (EVENTS[name]) {
        el.removeAttribute(name);                 // the parser made it an inline handler; drop it
        if (typeof val === 'function') el.addEventListener(EVENTS[name], val);
      } else if (name === 'ref') {
        el.removeAttribute('ref');
        if (typeof val === 'function') refs.push([val, el]);
      } else if (name === 'checked') {
        el.removeAttribute('checked');
        el.checked = !!val;
      } else if (name === 'value') {
        el.removeAttribute('value');
        el.value = text(val);
      } else {
        el.setAttribute(name, text(val));
      }
    }
  }

  /** Walk a node's children in place: expand sc-for / sc-if, substitute the rest. */
  function walk(node, scope, refs) {
    var kids = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < kids.length; i += 1) {
      var child = kids[i];

      if (child.nodeType === 3) {
        if (child.nodeValue.indexOf('{{') !== -1) {
          child.nodeValue = text(interpolate(child.nodeValue, scope));
        }
        continue;
      }
      if (child.nodeType !== 1) continue;

      var tag = String(child.tagName).toLowerCase();

      if (tag === 'sc-if') {
        var frag = document.createDocumentFragment();
        if (interpolate(child.getAttribute('value') || '', scope)) {
          var cs = Array.prototype.slice.call(child.childNodes);
          for (var j = 0; j < cs.length; j += 1) frag.appendChild(cs[j].cloneNode(true));
          walk(frag, scope, refs);
        }
        child.parentNode.replaceChild(frag, child);
        continue;
      }

      if (tag === 'sc-for') {
        var list = interpolate(child.getAttribute('list') || '', scope);
        var as = child.getAttribute('as') || 'item';
        var out = document.createDocumentFragment();
        var items = list && typeof list.length === 'number' ? list : [];
        for (var k = 0; k < items.length; k += 1) {
          var inner = document.createDocumentFragment();
          var kids2 = Array.prototype.slice.call(child.childNodes);
          for (var n = 0; n < kids2.length; n += 1) inner.appendChild(kids2[n].cloneNode(true));
          var sub = Object.create(scope);
          sub[as] = items[k];
          sub.$index = k;
          walk(inner, sub, refs);
          out.appendChild(inner);
        }
        child.parentNode.replaceChild(out, child);
        continue;
      }

      bindAttrs(child, scope, refs);
      walk(child, scope, refs);
    }
  }

  function fail(message) {
    var bar = document.createElement('pre');
    bar.textContent = 'support.js: ' + message;
    bar.style.cssText = 'margin:0;padding:12px 16px;background:#B3261E;color:#fff;' +
      'font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;';
    document.body.insertBefore(bar, document.body.firstChild);
    if (global.console) global.console.error('[support.js]', message);
  }

  function boot() {
    var host = document.querySelector('x-dc');
    if (!host) return;

    var style = document.createElement('style');
    style.textContent = 'x-dc{display:block}';
    document.head.appendChild(style);

    var helmet = host.querySelector('helmet');
    if (helmet) {
      var moved = Array.prototype.slice.call(helmet.childNodes);
      for (var i = 0; i < moved.length; i += 1) {
        if (moved[i].nodeType === 1) document.head.appendChild(moved[i]);
      }
      helmet.parentNode.removeChild(helmet);
    }

    var root = null;
    for (var c = 0; c < host.children.length; c += 1) {
      if (String(host.children[c].tagName).toLowerCase() !== 'helmet') { root = host.children[c]; break; }
    }
    if (!root) return fail('no root element inside <x-dc>');

    var pristine = root.cloneNode(true);
    var mount = document.createElement('div');
    root.parentNode.replaceChild(mount, root);

    var scriptEl = document.querySelector('script[data-dc-script]');
    var props = {};
    if (scriptEl && scriptEl.getAttribute('data-props')) {
      try {
        var declared = JSON.parse(scriptEl.getAttribute('data-props'));
        for (var key in declared) {
          if (key !== '$preview' && declared[key] && 'default' in declared[key]) {
            props[key] = declared[key].default;
          }
        }
      } catch (e) { return fail('data-props is not valid JSON — ' + e.message); }
    }

    function DCLogic(p) { this.props = p || {}; this.state = {}; }
    DCLogic.prototype.setState = function (patch) {
      for (var k in patch) this.state[k] = patch[k];
      schedule();
    };
    DCLogic.prototype.forceUpdate = function () { schedule(); };
    DCLogic.prototype.renderVals = function () { return {}; };

    var instance;
    try {
      var make = new Function('DCLogic', scriptEl.textContent + '\nreturn Component;');
      var Component = make(DCLogic);
      instance = new Component(props);
      if (!instance.props) instance.props = props;
      if (!instance.state) instance.state = {};
    } catch (e) { return fail('the screen’s logic block failed — ' + e.message); }

    var mounted = false;
    var queued = false;

    function schedule() {
      if (queued) return;
      queued = true;
      global.requestAnimationFrame(function () { queued = false; render(); });
    }

    function render() {
      var vals;
      try { vals = instance.renderVals() || {}; }
      catch (e) { return fail('renderVals() threw — ' + e.message); }

      // keep the caret where the person left it: a full re-render replaces inputs
      var active = document.activeElement;
      var focusId = active && active.id ? active.id : null;
      var start = null, end = null;
      if (focusId && 'selectionStart' in active) { start = active.selectionStart; end = active.selectionEnd; }

      var tree = pristine.cloneNode(true);
      var refs = [];
      var scope = Object.create(vals);
      bindAttrs(tree, scope, refs);
      walk(tree, scope, refs);
      mount.replaceChildren(tree);

      for (var i = 0; i < refs.length; i += 1) {
        try { refs[i][0](refs[i][1]); } catch (e) { /* a ref must never break a render */ }
      }

      if (focusId) {
        var again = document.getElementById(focusId);
        if (again) {
          again.focus();
          if (start !== null && 'setSelectionRange' in again) {
            try { again.setSelectionRange(start, end); } catch (e) { /* not a text input */ }
          }
        }
      }

      if (!mounted) {
        mounted = true;
        if (instance.componentDidMount) { try { instance.componentDidMount(); } catch (e) { fail('componentDidMount threw — ' + e.message); } }
      } else if (instance.componentDidUpdate) {
        try { instance.componentDidUpdate(); } catch (e) { /* non-fatal */ }
      }
    }

    global.addEventListener('pagehide', function () {
      if (instance && instance.componentWillUnmount) {
        try { instance.componentWillUnmount(); } catch (e) { /* leaving anyway */ }
      }
    });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
