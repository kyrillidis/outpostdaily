/* Breaking desk behaviour. Owned by the Breaking agent; concatenated after app.js at build.
   Live refresh: while the tab is visible, ask /api/breaking/ for the rendered desk once a minute (and once when the tab becomes
   visible) and swap it in when the data changed. Open <details>, scroll position and keyboard focus survive the swap. No animation. */
(function () {
  'use strict';
  var doc = document, bk = doc.getElementById('bk');
  if (!bk || !doc.body || doc.body.getAttribute('data-live') !== 'true' || !window.fetch) return;
  var busy = false, LINKS = '.bk-title a, .bk-lead-title a';
  function each(sel, fn) { Array.prototype.forEach.call(bk.querySelectorAll(sel), fn); }
  function sec(el) { var s = el.closest('section'); return s ? s.id : ''; }
  function findLink(k) {
    var els = bk.querySelectorAll(LINKS);
    for (var i = 0; i < els.length; i++) if (els[i].href === k.href && sec(els[i]) === k.sec) return els[i];
    return null;
  }
  // the headline nearest the top of the viewport, so the reader keeps their place when items are added above it
  function anchor() {
    if (window.pageYOffset < 40) return null;
    var tabs = doc.querySelector('.tabs'), line = (tabs ? tabs.offsetHeight : 48) + 70, els = bk.querySelectorAll(LINKS);
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.bottom > line) return { href: els[i].href, sec: sec(els[i]), y: r.top };
    }
    return null;
  }
  function apply(j) {
    var cur = bk.getAttribute('data-updated') || '';
    if (!j.updated || j.updated === cur || (cur && Date.parse(j.updated) < Date.parse(cur))) return; // unchanged, or an older cached copy
    var open = {}, at = anchor(), y = window.pageYOffset, f = doc.activeElement, keep = null;
    each('details[open][id]', function (d) { open[d.id] = true; });
    if (f && bk.contains(f)) keep = f.tagName === 'SUMMARY' && f.parentNode.id ? { det: f.parentNode.id } : f.tagName === 'A' ? { href: f.href, sec: sec(f) } : null;
    bk.innerHTML = j.html;
    bk.setAttribute('data-updated', j.updated);
    each('details[id]', function (d) { if (open[d.id]) d.open = true; });
    var el = at && findLink(at);
    if (el) {
      var dy = el.getBoundingClientRect().top - at.y;
      try { window.scrollBy({ top: dy, behavior: 'instant' }); } catch (e) { window.scrollBy(0, dy); }
    } else if (y > 40) window.scrollTo(0, y);
    if (keep) {
      var t = keep.det ? doc.getElementById(keep.det) : findLink(keep);
      if (t && keep.det) t = t.querySelector('summary');
      if (t && t.focus) t.focus({ preventScroll: true });
    }
    var o = window.outpost || {};
    if (o.relTimes) o.relTimes();
    if (o.refilter) o.refilter();
  }
  function poll() {
    if (busy || doc.hidden) return;
    busy = true;
    // one cache key per minute: readers share the edge copy, and the browser never serves an older one
    fetch('/api/breaking/?m=' + Math.floor(Date.now() / 6e4), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && typeof j.html === 'string' && j.html) apply(j); })
      .catch(function () {})
      .then(function () { busy = false; });
  }
  poll();
  setInterval(poll, 60000);
  doc.addEventListener('visibilitychange', poll);

  // a link to the collapsed Markets list opens it
  function reveal() {
    var id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
    var t = id ? doc.getElementById(id) : null, d = t && bk.contains(t) ? t.querySelector('details.bk-fold') : null;
    if (d) d.open = true;
  }
  window.addEventListener('hashchange', reveal);
  bk.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.bk-nav a')) setTimeout(reveal, 0); });
  reveal();

  // searching the page also opens the collapsed lists, so a match is never hidden inside one
  var q = doc.getElementById('kwSearch');
  if (q) q.addEventListener('input', function () { if (q.value.trim()) each('details.bk-more, details.bk-fold', function (d) { d.open = true; }); });
})();
