/* Dark web page: category filter and "Show more" for the claims grid. Optional: without JS every claim stays visible.
   Cards are hidden with data-hide (the page search uses the hidden attribute), so the two never fight; while a search is active the
   "Show more" collapse is lifted so the search can reach every claim. */
(function () {
  'use strict';
  var cat = 'all', open = false, current = null, searchBound = false;
  var search = document.getElementById('kwSearch'), clear = document.getElementById('kwClear');
  function init() {
  var bar = document.querySelector('.dk-filters'), grid = document.getElementById('dk-grid');
  if (!bar || !grid) return null;
  var more = document.getElementById('dk-more'), live = document.getElementById('dk-live');
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.dk-card'));
  var btns = Array.prototype.slice.call(bar.querySelectorAll('button[data-filter]'));
  var limit = parseInt(grid.getAttribute('data-limit'), 10) || 12;

  function searching() { return !!(search && search.value.trim()); }
  function inCat(c) { return cat === 'all' || c.getAttribute('data-cat') === cat; }

  // data-hide="filter" for other categories, data-hide="more" for matches beyond the first page
  function layout() {
    var q = searching(), n = 0;
    cards.forEach(function (c) {
      var why = '';
      if (!inCat(c)) why = 'filter';
      else if (++n > limit && !open && !q) why = 'more';
      if (why) c.setAttribute('data-hide', why); else c.removeAttribute('data-hide');
    });
  }

  function report() {
    var q = searching(), total = cards.filter(function (c) { return inCat(c) && !c.hidden; }).length;
    var shown = cards.filter(function (c) { return !c.hidden && !c.hasAttribute('data-hide'); }).length;
    var rest = total - limit, label = '';
    if (cat !== 'all') btns.forEach(function (b) { if (b.getAttribute('data-filter') === cat) label = ' in “' + b.querySelector('.dk-fl').textContent + '”'; });
    if (live) live.textContent = !total ? 'No claims match.' : (shown === total ? (total === 1 ? 'Showing 1 claim' : 'Showing all ' + total + ' claims') : 'Showing ' + shown + ' of ' + total + ' claims') + label + '.';
    if (more) {
      var wrap = more.parentNode;
      wrap.hidden = q || rest <= 0;
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show fewer claims' : 'Show ' + rest + ' more claim' + (rest === 1 ? '' : 's');
    }
  }

  // refilter: re-apply the page search after the grid changed (app.js)
  function update(user) {
    layout();
    if (user && window.outpost && window.outpost.refilter) window.outpost.refilter();
    report();
  }

  bar.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-filter]') : null;
    if (!b) return;
    var next = b.getAttribute('data-filter');
    cat = next === cat ? 'all' : next;
    btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-filter') === cat)); });
    update(true);
  });
  if (more) more.addEventListener('click', function () {
    open = !open;
    update(true);
    var sec = document.getElementById('dk-claims');
    if (!open && sec && sec.getBoundingClientRect().top < 0) sec.scrollIntoView();
  });
  btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-filter') === cat)); }); // keep the reader's filter across a live swap
  if (live) live.setAttribute('aria-live', 'off'); // the first update is not an announcement
  update(true);
  if (live) setTimeout(function () { live.setAttribute('aria-live', 'polite'); }, 0);
  return update;
  }

  current = init();
  // the page search changes `hidden` and, through #kwClear, tells us when it is cleared (typing, Esc or the clear button); bound once
  function onSearch() { if (current) current(false); }
  if (search && !searchBound) search.addEventListener('input', onSearch);
  if (clear && !searchBound && window.MutationObserver) new MutationObserver(onSearch).observe(clear, { attributes: true, attributeFilter: ['hidden'] });
  searchBound = true;

  // live refresh: while the tab is visible, ask /api/darkweb/ once a minute and swap the page body in when the data changed.
  // The reader's filter, "show more" state, open details and revealed pictures survive the swap.
  var root = document.getElementById('dkLive'), busy = false;
  if (!root || document.body.getAttribute('data-live') !== 'true' || !window.fetch) return;
  function keyOf(el) { var a = el.closest('article'); var l = a && a.querySelector('.dk-orig'); return l ? l.href : ''; }
  function apply(j) {
    var cur = root.getAttribute('data-updated') || '';
    if (!j.updated || j.updated === cur || (cur && Date.parse(j.updated) < Date.parse(cur))) return;
    var shown = {}, opened = {}, y = window.pageYOffset;
    Array.prototype.forEach.call(root.querySelectorAll('.dk-media[data-state="show"]'), function (m) { shown[keyOf(m)] = 1; });
    Array.prototype.forEach.call(root.querySelectorAll('details.dk-more[open]'), function (d) { opened[keyOf(d)] = 1; });
    root.innerHTML = j.html;
    root.setAttribute('data-updated', j.updated);
    Array.prototype.forEach.call(root.querySelectorAll('.dk-media'), function (m) { if (shown[keyOf(m)]) m.setAttribute('data-state', 'show'); });
    Array.prototype.forEach.call(root.querySelectorAll('details.dk-more'), function (d) { if (opened[keyOf(d)]) d.open = true; });
    current = init();
    var o = window.outpost || {};
    if (o.relTimes) o.relTimes();
    if (o.refilter) o.refilter();
    window.scrollTo(0, y);
  }
  function poll() {
    if (busy || document.hidden) return;
    busy = true;
    fetch('/api/darkweb/?m=' + Math.floor(Date.now() / 6e4), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && typeof j.html === 'string' && j.html) apply(j); })
      .catch(function () {})
      .then(function () { busy = false; });
  }
  setTimeout(poll, 4000);
  setInterval(poll, 60000);
})();

/* reveal a blurred post image on request (each image separately; nothing is stored) */
(function () {
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.dk-reveal') : null;
    if (!b) return;
    var fig = b.closest('.dk-media');
    if (fig) fig.setAttribute('data-state', 'show');
  });
})();
