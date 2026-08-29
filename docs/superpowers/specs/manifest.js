/* Manifest schematic — shared behaviour. Every feature is optional:
   each block checks for its own elements and does nothing if absent. */
(function () {
  'use strict';

  /* Rail: highlight the section currently in view. */
  var links = Array.prototype.slice.call(document.querySelectorAll('.rail a[href^="#"]'));
  if (links.length && 'IntersectionObserver' in window) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute('aria-current'); });
        var a = map[e.target.id];
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-10% 0px -70% 0px' });
    Object.keys(map).forEach(function (id) {
      var s = document.getElementById(id);
      if (s) obs.observe(s);
    });
  }

  /* Segmented controls: buttons carrying data-<key> swap the plate's data-<key>. */
  Array.prototype.slice.call(document.querySelectorAll('.seg[data-target]')).forEach(function (seg) {
    var plate = document.getElementById(seg.getAttribute('data-target'));
    var key = seg.getAttribute('data-key');
    if (!plate || !key) return;
    var btns = Array.prototype.slice.call(seg.querySelectorAll('button'));
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        plate.setAttribute('data-' + key, b.getAttribute('data-value'));
        btns.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      });
    });
  });

  /* Decision list: filter by theme and free text. Cards are authored in the HTML. */
  var list = document.getElementById('dlist');
  if (list) {
    var cards = Array.prototype.slice.call(list.querySelectorAll('.d'));
    var count = document.getElementById('dcount');
    var search = document.getElementById('dsearch');
    var tagBtns = Array.prototype.slice.call(document.querySelectorAll('.tagbtn'));
    var tag = 'all';

    cards.forEach(function (c) { c.dataset.hay = c.textContent.toLowerCase(); });

    function apply() {
      var q = search ? search.value.trim().toLowerCase() : '';
      var shown = 0;
      cards.forEach(function (c) {
        var vis = (tag === 'all' || c.dataset.tag === tag) &&
                  (!q || c.dataset.hay.indexOf(q) !== -1);
        c.hidden = !vis;
        if (vis) shown++;
      });
      if (count) {
        count.textContent = shown === cards.length
          ? 'Showing all ' + shown + ' decisions.'
          : 'Showing ' + shown + ' of ' + cards.length + ' decisions.';
      }
    }
    tagBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        tag = b.getAttribute('data-tag');
        tagBtns.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        apply();
      });
    });
    if (search) search.addEventListener('input', apply);
    apply();
  }
})();
