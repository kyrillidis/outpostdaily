/* Dark web page: category filter and "Show more" for the claims grid. Optional: without JS every claim stays visible.
   Cards are hidden with data-hide (the page search uses the hidden attribute), so the two never fight; while a search is active the
   "Show more" collapse is lifted so the search can reach every claim. */
(function () {
  'use strict';
  var bar = document.querySelector('.dk-filters'), grid = document.getElementById('dk-grid');
  if (!bar || !grid) return;
  var more = document.getElementById('dk-more'), live = document.getElementById('dk-live');
  var search = document.getElementById('kwSearch'), clear = document.getElementById('kwClear');
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.dk-card'));
  var btns = Array.prototype.slice.call(bar.querySelectorAll('button[data-filter]'));
  var limit = parseInt(grid.getAttribute('data-limit'), 10) || 12;
  var cat = 'all', open = false;

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
  // the page search changes `hidden` and, through #kwClear, tells us when it is cleared (typing, Esc or the clear button)
  if (search) search.addEventListener('input', function () { update(false); });
  if (clear && window.MutationObserver) new MutationObserver(function () { update(false); }).observe(clear, { attributes: true, attributeFilter: ['hidden'] });

  if (live) live.setAttribute('aria-live', 'off'); // the first update is not an announcement
  update(true);
  if (live) setTimeout(function () { live.setAttribute('aria-live', 'polite'); }, 0);
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
