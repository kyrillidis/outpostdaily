/* Outpost client behaviour. Every feature is optional: the pages read fine without this file. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function tabsHeight() { var t = $('.tabs'); return t ? t.offsetHeight : 48; }

  /* ---- legacy hash links (/#cyber and friends) -> real section URLs ---- */
  (function () {
    if (location.pathname !== '/' || !location.hash) return;
    var map = {
      cyber: '/cyber/', 'threat-intel': '/cyber/', secinfra: '/cyber/', 'ai-sec': '/cyber/', vulns: '/cves/',
      warfare: '/warfare/', world: '/geopolitics/', market: '/geopolitics/', geo: '/geopolitics/',
      today: '/today/', toolbox: '/toolbox/', 'archive-page': '/archive/'
    };
    var to = map[location.hash.slice(1)];
    if (to) location.replace(to);
  })();

  /* ---- theme: auto -> light -> dark ---- */
  var themeBtn = $('#themeToggle');
  function applyTheme(mode) {
    var m = mode === 'light' || mode === 'dark' ? mode : 'auto';
    if (m === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', m);
    if (themeBtn) {
      themeBtn.setAttribute('data-mode', m);
      themeBtn.setAttribute('aria-label', 'Colour theme: ' + m + '. Activate to change.');
    }
    return m;
  }
  if (themeBtn) {
    applyTheme(load('outpost-theme'));
    themeBtn.addEventListener('click', function () {
      var cur = themeBtn.getAttribute('data-mode');
      var next = applyTheme(cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto');
      store('outpost-theme', next === 'auto' ? null : next);
    });
  }

  /* ---- reading view: Read (full entries) / Scan (headlines only) ---- */
  var viewBtns = $$('[data-view-set]');
  function applyView(v) {
    var scan = v === 'scan';
    if (scan) root.setAttribute('data-view', 'scan'); else root.removeAttribute('data-view');
    viewBtns.forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-view-set') === 'scan') === scan)); });
    store('outpost-view', scan ? 'scan' : null);
  }
  function setView(v) {
    if (doc.startViewTransition && !reduce) doc.startViewTransition(function () { applyView(v); });
    else applyView(v);
  }
  applyView(load('outpost-view'));
  viewBtns.forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view-set')); }); });

  /* ---- search over the visible page ---- */
  var input = $('#kwSearch'), clear = $('#kwClear'), note = $('#noMatches');
  function norm(s) { return (s || '').toLowerCase(); }
  function recompute() {
    if (!input) return;
    var raw = input.value.trim(), q = norm(raw), inMain = 0;
    $$('.page-content .kw-unit, .rail .kw-unit').forEach(function (u) {
      var show = !q || norm(u.textContent).indexOf(q) !== -1;
      u.hidden = !show;
      if (show && u.closest('.page-content')) inMain++;
    });
    if (note) {
      note.hidden = !q;
      note.textContent = !q ? '' : inMain
        ? inMain + (inMain === 1 ? ' match' : ' matches') + ' for “' + raw + '” on this page.'
        : 'No matches for “' + raw + '” on this page. Try the keyword index, or clear the search.';
    }
    if (clear) clear.hidden = !q;
  }
  if (input) {
    input.addEventListener('input', recompute);
    if (clear) clear.addEventListener('click', function () { input.value = ''; recompute(); input.focus(); });
  }
  doc.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('.tag, .kwchip') : null;
    if (!el || !input) return;
    e.preventDefault();
    input.value = el.getAttribute('data-kw') || el.textContent.trim();
    recompute();
    var main = $('#main');
    if (main) main.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  });

  /* ---- keyword index, counted from this page's own tags and CVE ids ---- */
  (function () {
    var idx = $('#keywordIndex'), main = $('.page-content');
    if (!idx || !main) return;
    var text = main.textContent, terms = {};
    $$('.tag[data-kw]', main).forEach(function (t) { var k = t.getAttribute('data-kw'); terms[norm(k)] = k; });
    (text.match(/CVE-\d{4}-\d{4,7}/g) || []).forEach(function (c) { terms[norm(c)] = c; });
    var counted = Object.keys(terms).map(function (key) {
      var term = terms[key], m = text.match(new RegExp('(^|[^\\w])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])', 'gi'));
      return { term: term, count: m ? m.length : 0 };
    }).filter(function (k) { return k.count > 0; })
      .sort(function (a, b) { return b.count - a.count || a.term.localeCompare(b.term); })
      .slice(0, 20);
    counted.forEach(function (k) {
      var b = doc.createElement('button'), c = doc.createElement('span');
      b.type = 'button'; b.className = 'kwchip'; b.setAttribute('data-kw', k.term); b.textContent = k.term;
      c.className = 'kwcount'; c.textContent = k.count; b.appendChild(c); idx.appendChild(b);
    });
    if (!counted.length) { var sec = idx.closest('.kwsection'); if (sec) sec.hidden = true; }
  })();

  /* ---- keyboard: / search, Esc clear, j/k move between entries, s switch view ---- */
  function typing(t) { return !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName)); }
  function moveEntry(dir) {
    var list = $$('.entry').filter(function (n) { return !n.hidden && n.offsetParent !== null; });
    if (!list.length) return;
    var active = doc.activeElement && doc.activeElement.closest ? doc.activeElement.closest('.entry') : null;
    var i = active ? list.indexOf(active) : -1;
    if (i < 0) {
      var line = tabsHeight() + 12;
      i = list.findIndex(function (n) { return n.getBoundingClientRect().top >= line; });
      if (i < 0) i = list.length;
      if (dir > 0) i -= 1;
    }
    var next = list[Math.min(list.length - 1, Math.max(0, i + dir))];
    next.setAttribute('tabindex', '-1');
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }
  doc.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && input && input.value) { input.value = ''; recompute(); return; }
    if (typing(e.target)) return;
    if (e.key === '/' && input) { e.preventDefault(); input.focus(); input.select(); }
    else if (e.key === 's') setView(root.getAttribute('data-view') === 'scan' ? 'read' : 'scan');
    else if (e.key === 'j') moveEntry(1);
    else if (e.key === 'k') moveEntry(-1);
  });

  /* ---- time: show the compile stamp in the reader's zone, flag a stalled pipeline ---- */
  (function () {
    var stamp = $('#compiledStamp');
    if (!stamp) return;
    var M = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
    var m = stamp.textContent.match(/(\d{2}):(\d{2})\s*UTC\s*[,·]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    var mo = m ? M[m[4].toLowerCase()] : undefined;
    if (!m || mo === undefined) return;
    var at = new Date(Date.UTC(+m[5], mo, +m[3], +m[1], +m[2]));
    if (isNaN(at.getTime())) return;
    stamp.textContent = 'Compiled ' + at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) +
      ' · ' + at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    var stale = $('#staleness');
    if (!stale || doc.body.getAttribute('data-live') !== 'true') return;
    function tick() {
      var ms = Date.now() - at.getTime(), h = ms / 36e5;
      stale.textContent = '(' + (h < 1 ? Math.max(1, Math.round(ms / 6e4)) + 'm ago' : h < 48 ? Math.round(h) + 'h ago' : Math.round(h / 24) + 'd ago') + ')';
      if (h > 50) stale.setAttribute('data-stale', 'late'); else if (h > 30) stale.setAttribute('data-stale', 'warn'); else stale.removeAttribute('data-stale');
      stale.title = h > 30 ? 'Later than the usual daily update; the pipeline may be stuck.' : '';
    }
    tick();
    setInterval(tick, 60000);
  })();

  /* ---- checklist ticks persist per edition ---- */
  (function () {
    var boxes = $$('.checklist input[data-check-id]');
    if (!boxes.length) return;
    var key = 'outpost-checks-' + (doc.body.getAttribute('data-edition') || '0'), saved = {};
    try { saved = JSON.parse(load(key) || '{}') || {}; } catch (e) { saved = {}; }
    boxes.forEach(function (b) {
      var id = b.getAttribute('data-check-id');
      b.checked = !!saved[id];
      b.addEventListener('change', function () { saved[id] = b.checked; store(key, JSON.stringify(saved)); });
    });
  })();

  /* ---- newsletter form feedback (the form itself posts to Buttondown in a popup) ---- */
  $$('.sub-form').forEach(function (form) {
    var out = $('.coupon-note', form), btn = $('button[type="submit"]', form);
    form.addEventListener('submit', function () {
      if (out) out.textContent = 'Almost there. Confirm your email in the popup (or check your inbox) to finish subscribing.';
      if (btn) setTimeout(function () { btn.textContent = 'Check popup'; btn.disabled = true; }, 0);
    });
  });

  /* ---- on narrow screens, bring the current tab into view ---- */
  (function () {
    var cur = $('.tabs [aria-current="page"]'), box = cur && cur.parentNode;
    if (box && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, cur.offsetLeft - 16);
  })();
})();
