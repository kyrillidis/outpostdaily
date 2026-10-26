// Builds the inside of the Breaking desk (status line, "Top now", stream navigation, one panel per stream, reading notes)
// as an HTML string. Used by the page build (src/render.mjs) AND by the live API (api/breaking.js), so the page and its live
// refresh can never drift apart. Pure ESM: relative imports only, no I/O, no Node-only APIs. Everything interpolated into
// HTML goes through esc().
//
// CONTRACT
//   renderBreakingBody({ items, health, updated, now }) -> string
//     items   output of normalizeBreaking() in ./feed.mjs (newest first). Fields: id, kind ('x'|'news'|'ransomware'),
//             group ('crisis'|'darkweb'|'cyber'|'redteam'|'blueteam'|'markets'), source, url, published (ISO), severity ('high'|'normal'),
//             verified (bool), headline (tidy one line), text (full tidy text), topics (string[]), also ([{source,url,kind}])
//     health  [{ name, ok, n?, error? }] from the last collector run
//     updated ISO string of the last data change (or null)
//     now     ms timestamp used for the Top now window
//   The caller wraps the result in <div class="bk" id="bk" data-updated="...">; live refresh (src/assets/breaking.js) swaps that
//   div's innerHTML and keeps open <details> open by id, so every <details> here has a stable, unique id.
//   Callers drop forum listings before normalising (they live on /dark-web/). If a forum item does arrive it is shown as an
//   unverified claim and its links carry rel="noopener nofollow ugc".
//   Server-rendered times are absolute ("18:58 UTC", "25 Oct") so a cached page never claims a stale "5 min ago"; the client
//   (window.outpost.relTimes) turns every <time data-rel> younger than a day into a relative time.
//   Dark web items never get a "Full post" disclosure: that stream shows headlines only, the Dark web desk frames the claims.
import { topNow, decode, GROUP_LABEL, KIND_LABEL } from './feed.mjs';

// decode first so text that still carries an entity (&amp; in a feed URL) is escaped once, never twice; every attribute here is double-quoted
const esc = (s) => String(decode(s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ORDER = ['crisis', 'cyber', 'darkweb', 'redteam', 'blueteam', 'markets'];
const NOTE = {
  crisis: 'Conflict and crisis reports from OSINT accounts on X and wire outlets. Early reports are often revised.',
  cyber: 'Security researchers, advisories and the security press.',
  darkweb: 'Third-party claims from leak sites and threat-intel accounts, not confirmed incidents. Outpost links to them and never republishes leaked data.',
  redteam: 'Offensive research and tooling from practitioners on X.',
  blueteam: 'Detection, DFIR and threat intelligence from defenders.',
  markets: 'Market-moving headlines, relevant when conflict or cyber events hit prices.',
};
const SHOW = 5; // rows visible before "Show N more"
const CAP = 14; // rows listed per panel, to keep the page light
const MAX_SRC = 8;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };
const clock = (t) => new Date(t).toISOString().slice(11, 16);
const day = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const span = (cls, text) => (text ? `<span class="${cls}">${esc(text)}</span>` : '');
const when = (i) => {
  const t = ms(i.published);
  return t == null ? '' : `<span class="bk-when"><span class="bk-clock">${clock(t)} UTC</span> <time class="bk-ago" datetime="${new Date(t).toISOString()}" data-rel>${day(t)}</time></span>`;
};

const SR = '<span class="sr-only"> (opens the source)</span>';
const safeUrl = (u) => { const s = decode(u ?? '').trim(); return /^https?:\/\/[^\s<>"]+$/i.test(s) ? s : ''; };
const anchor = (u, kind, inner) => {
  const h = safeUrl(u);
  return h ? `<a href="${esc(h)}" target="_blank" rel="${kind === 'forum' ? 'noopener nofollow ugc' : 'noopener'}">${inner}</a>` : inner;
};
const headlineOf = (i) => i.headline || i.title || i.text || '';
const keyOf = (i, k) => String(i.id ?? '').replace(/[^\w-]/g, '') || `${i.group}${k}`;

// "+N sources": the other sources that carried the same story, behind a small disclosure
const alsoHtml = (i, id, pfx, uid) => {
  const o = (i.also ?? []).filter((a) => a && a.source);
  if (!o.length) return '';
  const list = o.map((a) => `${anchor(a.url, a.kind, esc(a.source))}${KIND_LABEL[a.kind] ? ` (${esc(KIND_LABEL[a.kind])})` : ''}`).join(', ');
  return `<details class="bk-d" id="${uid(`bk-${pfx}a-${id}`)}"><summary>+${plural(o.length, 'source', 'sources')}<span class="sr-only"> also report this</span></summary><p>Also reported by ${list}.</p></details>`;
};

// X posts often carry more than the one-line headline; the rest sits behind a disclosure (never for the dark web stream)
const fullHtml = (i, id, pfx, uid) => {
  const text = String(i.text ?? '');
  if (i.kind !== 'x' || i.group === 'darkweb' || text.length < String(i.headline ?? '').length + 24) return '';
  return `<details class="bk-d" id="${uid(`bk-${pfx}f-${id}`)}"><summary>Full post</summary><p>${esc(text)}</p></details>`;
};

// one meta line for rows and Top now items: source, kind, topics, markers and the disclosures, separated by spaces
const meta = (i, id, pfx, uid, lead) => [
  lead ? `<span class="bk-stream" data-g="${esc(i.group)}">${esc(GROUP_LABEL[i.group] ?? i.group)}</span>` : '',
  span('bk-src', i.source),
  lead ? when(i) : span('bk-kind', KIND_LABEL[i.kind]),
  ...(i.topics ?? []).slice(0, 2).map((t) => span('bk-chip', t)),
  i.severity === 'high' ? '<span class="bk-hi">High signal</span>' : '',
  i.verified ? '' : '<span class="bk-unv">Unverified</span>',
  alsoHtml(i, id, pfx, uid),
  fullHtml(i, id, pfx, uid),
].filter(Boolean).join(' ');

const row = (i, k, uid) => {
  const id = keyOf(i, k);
  return `<li class="bk-row kw-unit" data-kind="${esc(i.kind)}" data-sev="${i.severity === 'high' ? 'high' : 'normal'}">${when(i)}<div class="bk-main"><p class="bk-title">${anchor(i.url, i.kind, esc(headlineOf(i)) + SR)}</p><div class="bk-meta">${meta(i, id, 'r', uid, false)}</div></div></li>`;
};
const lead = (i, k, uid) => {
  const id = keyOf(i, k);
  return `<li class="bk-lead kw-unit" data-kind="${esc(i.kind)}" data-sev="${i.severity === 'high' ? 'high' : 'normal'}" data-g="${esc(i.group)}"><h3 class="bk-lead-title">${anchor(i.url, i.kind, esc(headlineOf(i)) + SR)}</h3><div class="bk-meta">${meta(i, id, 't', uid, true)}</div></li>`;
};

const head = (id, label, sub) => `<header class="bk-head"><h2 class="bk-h" id="${id}-h">${esc(label)}</h2>${sub ? `<p class="bk-sub">${esc(sub)}</p>` : ''}</header>`;

function sources(list) {
  const c = new Map();
  for (const i of list) if (i.source) c.set(i.source, (c.get(i.source) ?? 0) + 1);
  const all = [...c].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  if (!all.length) return '';
  return `<p class="bk-srcs"><b>Sources:</b> ${all.slice(0, MAX_SRC).map(([s, n]) => `${esc(s)} (${n})`).join(', ')}${all.length > MAX_SRC ? ` and ${all.length - MAX_SRC} more` : ''}</p>`;
}

function panel(g, list, uid) {
  const id = `bk-${g}`, n = list.length, t0 = n ? ms(list[0].published) : null;
  const shown = list.slice(0, g === 'darkweb' ? SHOW : CAP);
  const rows = (arr, off) => `<ol class="bk-rows">${arr.map((i, k) => row(i, off + k, uid)).join('')}</ol>`;
  let body = '';
  if (!n) body = '<p class="bk-empty">Nothing in this stream right now. Promotional and off-topic posts are filtered out.</p>';
  else if (g === 'markets') body = `<details class="bk-fold" id="${id}-fold"><summary>Show ${plural(shown.length, 'market item', 'market items')}</summary>${rows(shown, 0)}</details>`;
  else {
    const rest = shown.slice(SHOW);
    body = rows(shown.slice(0, SHOW), 0) + (rest.length ? `<details class="bk-more" id="${id}-more"><summary>Show ${rest.length} more</summary>${rows(rest, SHOW)}</details>` : '');
  }
  const cap = n > shown.length ? `<p class="bk-cap">Listing the ${shown.length} newest of ${n}.</p>` : '';
  const desk = g === 'darkweb' ? '<a class="bk-go" href="/dark-web/">Open the Dark web desk<svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a>' : '';
  const sub = `${plural(n, 'item', 'items')}${t0 == null ? '' : ` · latest ${clock(t0)} UTC`}`;
  return `<section class="bk-panel" id="${id}" data-g="${g}" aria-labelledby="${id}-h">${head(id, GROUP_LABEL[g], sub)}<p class="bk-note">${esc(NOTE[g])}</p>${body}${cap}${desk}${sources(list)}</section>`;
}

function status(list, health, updated) {
  const t = ms(updated), ok = health.filter((h) => h && h.ok).length, bad = health.length - ok;
  const high = list.filter((i) => i.severity === 'high').length;
  const li = [...health].filter(Boolean).sort((a, b) => Number(!!a.ok) - Number(!!b.ok)).map((h) => `<li><span class="bk-hn">${esc(h.name)}</span> ${h.ok
    ? `<span class="bk-ok">OK</span>${Number.isFinite(h.n) ? ` ${plural(h.n, 'item', 'items')}` : ''}`
    : `<span class="bk-bad">Failed</span>${h.error ? ` ${esc(h.error)}` : ''}`}</li>`).join('');
  return `<div class="bk-status" id="bk-status">${[
    '<span class="bk-live"><i class="bk-dot" aria-hidden="true"></i>Live</span>',
    t == null ? '<span>No update time recorded</span>' : `<span>Last change <b>${clock(t)} UTC</b> (<time datetime="${new Date(t).toISOString()}" data-rel>${day(t)}</time>)</span>`,
    `<span><b>${list.length}</b> ${list.length === 1 ? 'item' : 'items'}</span>`,
    `<span><b>${high}</b> high signal</span>`,
    health.length ? `<span><b>${ok}/${health.length}</b> sources responding</span>` : '',
    health.length ? `<details class="bk-health" id="bk-health"><summary>Source status${bad ? ` (${bad} failed)` : ''}</summary><ul class="bk-hl">${li}</ul></details>` : '',
  ].filter(Boolean).join('')}</div>`;
}

const FOOT = '<div class="bk-foot" id="bk-howto"><p><b>How to read the desk.</b> <b>High signal</b> means the item matched our list of alarm words, such as zero-day, actively exploited, breach, ransomware, missile or strike. It is an automatic keyword match, not an editor’s judgement.</p>'
  + '<p><b>Unverified</b> means the item is a post by an individual account or a third-party claim that Outpost has not confirmed; items from news outlets carry no such mark. When several sources carry one story they are merged, and “+N sources” lists the others.</p>'
  + '<p>Times are UTC. Each stream shows its 14 newest items from the last 72 hours. More in the <a href="/methodology/">methodology</a>.</p></div>';

export function renderBreakingBody({ items = [], health = [], updated = null, now = Date.now() } = {}) {
  const list = (Array.isArray(items) ? items : []).filter((i) => i && ORDER.includes(i.group)).sort((a, b) => (ms(b.published) ?? 0) - (ms(a.published) ?? 0));
  const by = Object.fromEntries(ORDER.map((g) => [g, list.filter((i) => i.group === g)]));
  const used = new Set();
  const uid = (base) => { let id = base, n = 1; while (used.has(id)) id = `${base}-${++n}`; used.add(id); return id; };
  const top = topNow(list, { now, n: 6 });
  return [
    status(list, Array.isArray(health) ? health : [], updated),
    `<section class="bk-top" id="bk-top" aria-labelledby="bk-top-h">${head('bk-top', 'Top now')}<p class="bk-note">The strongest items of the last 24 hours, at most two per stream, ranked by severity, number of sources, verification and recency. Dark web and Markets are not included.</p>${top.length ? `<ol class="bk-leads">${top.map((i, k) => lead(i, k, uid)).join('')}</ol>` : '<p class="bk-empty">Nothing in the last 24 hours stands out yet. Every stream is listed below.</p>'}</section>`,
    `<nav class="bk-nav" id="bk-nav" aria-label="Breaking streams"><a href="#bk-top" data-s="all" aria-current="true">All streams <span class="bk-n">${list.length}<span class="sr-only"> items</span></span></a>${ORDER.map((g) => {
      const hi = by[g].filter((i) => i.severity === 'high').length;
      return `<a href="#bk-${g}" data-s="${g}" data-g="${g}">${esc(GROUP_LABEL[g])} <span class="bk-n">${by[g].length}<span class="sr-only"> ${by[g].length === 1 ? 'item' : 'items'}</span></span>${hi ? `<span class="bk-nhi" title="${plural(hi, 'high-signal item', 'high-signal items')}">${hi}<span class="sr-only"> high signal</span></span>` : ''}</a>`;
    }).join('')}<button type="button" class="bk-only" id="bk-only" aria-pressed="false" hidden>High signal only</button></nav>`,
    '<p class="bk-legend" id="bk-legend"><span class="bk-hi">High signal</span> matched an alarm word <span class="bk-unv">Unverified</span> a post or claim we have not confirmed <span class="bk-d-demo">+N sources</span> the same story, merged</p>',
    `<div class="bk-grid" id="bk-grid"><div class="bk-cols">${ORDER.map((g) => panel(g, by[g], uid)).join('\n')}</div></div>`,
    FOOT,
  ].join('\n');
}
