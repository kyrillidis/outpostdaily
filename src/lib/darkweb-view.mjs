// Builds the body of the Dark web page as an HTML string. Pure: no I/O. Everything interpolated into HTML goes through esc() or url().
//
// CONTRACT
//   renderDarkwebBody({ claims, ransomware, breaches, now }) -> string      (the page header and ad slot are added by src/render.mjs)
//   claims      data/darkweb.json `items`: [{ id, kind ('x'|'forum'|'ransomware'), source, url (the ORIGINAL claim link), published (ISO),
//               headline (neutral, framed as a claim), claim, context, advice (string[]), verified:false }]  newest first
//               classifyClaim() from ./feed.mjs supplies { category, categoryLabel, sector, country, countryName, records, actor }.
//   ransomware  data/ransomware.json: { updated, items: [{ id, group, victim, country (always '' for RansomLook, so no country is shown), published (ISO), url (the group's page) }] } newest first, ~7 days
//   breaches    data/breaches.json:   { updated, items: [{ name, slug, domain, breachDate (YYYY-MM-DD), addedDate (ISO), count, classes: string[],
//               verified, description (plain text), url }] } newest first, ~45 days. Licensed CC BY 4.0: attribution to Have I Been Pwned with a link is REQUIRED.
//   Any of the three may be empty or missing; every section renders a sensible empty state and nothing here throws.
//   NEVER embed third-party images (tweet, forum or leak-site screenshots often contain stolen personal data): visuals are drawn by us (CSS/inline SVG).
//
// MARKUP NOTES (styles: src/assets/darkweb.css, behaviour: src/assets/darkweb.js)
//   - Server-rendered times are absolute ("25 Oct, 20:04 UTC") so a cached page never claims a stale "5 min ago"; app.js turns every
//     <time data-rel> younger than a day into a relative time.
//   - Claim cards are .kw-unit (page search hides them with the hidden attribute); the category filter and "Show more" use data-hide
//     on the cards instead, so the two never fight. Without JS every claim stays visible and the filter bar stays hidden.
//   - Icons are drawn once in an inline SVG sprite (only the symbols this render uses) and referenced with <use>.
import { classifyClaim, CATEGORIES, RANSOM_GROUPS, KIND_LABEL, decode } from './feed.mjs';

const LIMIT = 12; // claim cards shown before "Show N more" (applied by darkweb.js)
const BOARD_ROWS = 8, LISTING_ROWS = 20, BREACH_ROWS = 20;
const RANSOM_DAYS = 7, BREACH_DAYS = 45;
const RANSOMLOOK = 'https://www.ransomlook.io/', HIBP = 'https://haveibeenpwned.com/', CC_BY = 'https://creativecommons.org/licenses/by/4.0/';

// ---------- small helpers ----------
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const dec = (s) => { try { return decode(s ?? ''); } catch { return String(s ?? ''); } }; // decode() throws on absurd code points
const esc = (s) => String(dec(s)).replace(/[&<>"']/g, (c) => ENT[c]);
const str = (v) => (v == null ? '' : String(v)).trim();
const url = (u) => { const s = str(dec(u)); return /^https?:\/\/[^\s<>"'`]+$/i.test(s) ? s : ''; };
const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const num = (n) => { const x = Number(n); return Number.isFinite(x) && x >= 0 ? Math.round(x).toLocaleString('en-US') : ''; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };
const clock = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };
const dayOf = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const timeTag = (iso, cls = '', rel = true) => { const t = ms(iso); return t == null ? '' : `<time${cls ? ` class="${cls}"` : ''} datetime="${new Date(t).toISOString()}"${rel ? ' data-rel' : ''}>${clock(t)}</time>`; };
const dateTag = (iso) => { const t = ms(iso); return t == null ? '' : `<time datetime="${new Date(t).toISOString().slice(0, 10)}">${dayOf(t)}</time>`; };

let REGIONS = null;
try { REGIONS = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* no ICU: show codes only */ }
const regionName = (cc) => { try { const n = /^[A-Z]{2}$/.test(cc) ? REGIONS?.of(cc) : ''; return n && n !== cc ? n : ''; } catch { return ''; } };

// the tracker spells group names its own way ("Whitearmor", "Brain cipher"); merge spelling variants and use the known spelling when there is one
const gkey = (g) => str(g).toLowerCase().replace(/[^a-z0-9]/g, '');
const KNOWN = new Map();
for (const g of RANSOM_GROUPS) if (!KNOWN.has(gkey(g))) KNOWN.set(gkey(g), g.replace(/\.$/, ''));
const groupName = (g) => KNOWN.get(gkey(g)) ?? str(g);

// The handle of one social account is deliberately never printed (the original-post link still goes to the post itself).
const HIDE_NAME = /darkwebinformer/i;

// ---------- icons: one 24x24 grid, 1.5 stroke, round joins ----------
const ICONS = {
  'c-ransomware': '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15" r="1.3"/><path d="M12 16.3v2"/>',
  'c-sale': '<path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1-.6-1.4Z"/><circle cx="8" cy="8" r="1.3"/>',
  'c-access': '<circle cx="7.5" cy="16.5" r="3.5"/><path d="M10 14 20 4M16 8l2.5 2.5M13.5 10.5l2 2"/>',
  'c-leak': '<ellipse cx="9.5" cy="5.5" rx="6.5" ry="2.5"/><path d="M3 5.5v9c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-9M3 10c0 1.4 2.9 2.5 6.5 2.5S16 11.4 16 10"/><path d="M19.5 11.5c1.4 1.7 2.2 2.8 2.2 3.9a2.2 2.2 0 0 1-4.4 0c0-1.1.8-2.2 2.2-3.9Z"/>',
  'c-vuln': '<path d="M12 3l7.5 3v5.6c0 4.5-3 8-7.5 9.4-4.5-1.4-7.5-4.9-7.5-9.4V6Z"/><path d="M12 8.2v4.4M12 15.6h.01"/>',
  'c-hacktivism': '<path d="M3.5 10v4a1 1 0 0 0 1 1H7l8 4.5V4.5L7 9H4.5a1 1 0 0 0-1 1Z"/><path d="M18.2 9a4.2 4.2 0 0 1 0 6M20.6 6.5a8 8 0 0 1 0 11"/>',
  'c-malware': '<path d="M9 8.5a3 3 0 0 1 6 0"/><rect x="7.5" y="8.5" width="9" height="11" rx="4.5"/><path d="M12 8.5v11M10 5.9 8.5 3.8M14 5.9l1.5-2.1M7.5 12.5H4M8 9.8 5 8M8 16.5l-3 2M16.5 12.5H20M16 9.8l3-1.8M16 16.5l3 2"/>',
  'c-other': '<path d="M7 3.5h7l4.5 4.5v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4.5M9 9.5h2M9 12.5h6M9 15.5h6"/>',
  's-health': '<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6Z"/>',
  's-gov': '<path d="M3.5 9.5 12 4l8.5 5.5Z"/><path d="M6.5 12.5v5M10 12.5v5M14 12.5v5M17.5 12.5v5M4 20h16"/>',
  's-def': '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
  's-fin': '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10.5h18M6.5 15h4"/>',
  's-edu': '<path d="M2.5 9.5 12 5l9.5 4.5L12 14Z"/><path d="M6 11.6V16c0 1.4 2.7 2.8 6 2.8s6-1.4 6-2.8v-4.4M21.5 9.5V15"/>',
  's-tech': '<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="4" height="4" rx=".5"/><path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5"/>',
  's-telecom': '<circle cx="12" cy="10.5" r="1.6"/><path d="M12 12.2V21M8.7 7.2a4.7 4.7 0 0 0 0 6.6M15.3 7.2a4.7 4.7 0 0 1 0 6.6M5.9 4.4a8.7 8.7 0 0 0 0 12.2M18.1 4.4a8.7 8.7 0 0 1 0 12.2"/>',
  's-energy': '<path d="M13.5 2.5 5.5 13.5H11L10 21.5l8-11H12.5Z"/>',
  's-transport': '<path d="M3 17V6.5A1.5 1.5 0 0 1 4.5 5h8A1.5 1.5 0 0 1 14 6.5V17M3 17h2.5M9.5 17h6M19.5 17H21M14 9h3.8L21 12.4V17"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  's-mfg': '<path d="M4 20.5V11l5 3V11l5 3V4.5h6v16ZM7.5 17.5h1M11 17.5h1M16 17.5h2"/>',
  's-legal': '<path d="M12 4v16.5M7.5 20.5h9M5 7.5h14"/><path d="M5 7.5l-2.6 6a2.6 2.6 0 0 0 5.2 0ZM19 7.5l-2.6 6a2.6 2.6 0 0 0 5.2 0Z"/>',
  's-retail': '<path d="M5.5 8h13l-1 12.5h-11Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  's-media': '<path d="M4 5.5h12.5v13H5.5A1.5 1.5 0 0 1 4 17Z"/><path d="M16.5 9.5H20v7.5a1.5 1.5 0 0 1-1.5 1.5h-2M7.5 9h6M7.5 12.5h6M7.5 16h4"/>',
  'i-ext': '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  'i-chev': '<path d="M9 5l7 7-7 7"/>',
  'i-check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'i-info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
};
const SECTOR_ICON = { Healthcare: 's-health', Government: 's-gov', Defence: 's-def', Finance: 's-fin', Education: 's-edu', Technology: 's-tech', Telecom: 's-telecom', 'Energy & utilities': 's-energy', 'Transport & logistics': 's-transport', Manufacturing: 's-mfg', 'Legal & professional': 's-legal', 'Retail & consumer': 's-retail', Media: 's-media' };
const ORIGINAL = { x: 'Original post on X', forum: 'Original forum post', ransomware: 'Original listing' };

// ---------- the page ----------
export function renderDarkwebBody({ claims = [], ransomware = { items: [] }, breaches = { items: [] }, now = Date.now() } = {}) {
  const t0 = Number(now) || Date.now();
  const used = new Set();
  const ic = (id, cls = 'dk-ic') => { used.add(id); return `<svg class="${cls}" aria-hidden="true"><use href="#dk-${id}"/></svg>`; };
  const within = (iso, days) => { const t = ms(iso); return t != null && t0 - t < days * 864e5; };
  const external = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`;

  const posts = list(claims).slice().sort((a, b) => (ms(b.published) ?? 0) - (ms(a.published) ?? 0));
  const listings = list(ransomware?.items).slice().sort((a, b) => (ms(b.published) ?? 0) - (ms(a.published) ?? 0));
  const leaks = list(breaches?.items).slice().sort((a, b) => (ms(b.addedDate) ?? 0) - (ms(a.addedDate) ?? 0));

  // ----- numbers (all computed from the data) -----
  const recent = listings.filter((i) => within(i.published, RANSOM_DAYS));
  const groupTally = new Map();
  for (const i of recent) { const k = gkey(i.group); if (k) groupTally.set(k, { name: groupName(i.group), n: (groupTally.get(k)?.n ?? 0) + 1 }); }
  const topGroups = [...groupTally.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, BOARD_ROWS);
  const recentBreaches = leaks.filter((b) => within(b.addedDate, BREACH_DAYS));

  // ----- 1. note and 2. stats -----
  const note = `<div class="dk-note" role="note">${ic('i-info')}<p><strong>Everything below is a claim by someone else.</strong> Outpost has not verified it. We restate each claim in neutral words, add general background and link the original post. We never republish leaked data or host screenshots of it. <a href="/methodology/">How we handle claims</a></p></div>`;
  const stat = (n, label) => `<div><dt>${esc(label)}</dt><dd>${n}</dd></div>`;
  const stats = `<dl class="dk-stats">${stat(posts.length, 'Claims written up')}${stat(recent.length, 'Ransomware listings, 7 days')}${stat(groupTally.size, 'Active groups, 7 days')}${stat(recentBreaches.length, 'Confirmed breaches, 45 days')}</dl>`;

  // ----- 3. latest claims -----
  const claimsHtml = (() => {
    const head = (meta = '') => `<header class="dk-sech"><h2 id="dk-claims-h">Latest claims</h2>${meta}</header>`;
    if (!posts.length) return `<section class="dk-sec" id="dk-claims" aria-labelledby="dk-claims-h">${head()}<p class="dk-lede">No claim write-ups are available right now. New ones appear here as they are published.</p></section>`;
    const rows = posts.map((c) => ({ c, k: classifyClaim({ ...c, headline: str(c.headline), claim: str(c.claim), kind: str(c.kind) }) }));
    const counts = {};
    for (const { k } of rows) counts[k.category] = (counts[k.category] ?? 0) + 1;
    const cats = Object.keys(CATEGORIES).filter((k) => counts[k]);
    const filters = cats.length > 1 || posts.length > LIMIT
      ? `<div class="dk-filters" role="group" aria-label="Filter claims by category"><button type="button" class="dk-fbtn" data-filter="all" aria-pressed="true"><span class="dk-fl">All</span> <span class="dk-n">${posts.length}</span></button>${cats.map((k) => `<button type="button" class="dk-fbtn" data-filter="${k}" data-cat="${k}" aria-pressed="false">${ic(`c-${k}`)}<span class="dk-fl">${esc(CATEGORIES[k])}</span> <span class="dk-n">${counts[k]}</span></button>`).join('')}</div>`
      : '';
    const rest = posts.length - LIMIT;
    return `<section class="dk-sec" id="dk-claims" aria-labelledby="dk-claims-h">${head(`<p class="dk-sechmeta">${plural(posts.length, 'write-up')}, newest first</p>`)}` +
      `<p class="dk-lede">Each card restates one post in neutral words, with general background and what defenders can do. Every one links to the original.</p>${filters}` +
      `<p class="dk-live" id="dk-live" role="status" aria-live="polite">${posts.length === 1 ? 'Showing 1 claim.' : `Showing all ${posts.length} claims.`}</p>` +
      `<div class="dk-grid" id="dk-grid" data-limit="${LIMIT}">${rows.map(({ c, k }) => card(c, k)).join('')}</div>` +
      (rest > 0 ? `<p class="dk-morewrap"><button type="button" class="dk-morebtn" id="dk-more" aria-expanded="false" aria-controls="dk-grid">Show ${plural(rest, 'more claim')}</button></p>` : '') + '</section>';
  })();

  function card(c, k) {
    const cat = CATEGORIES[k.category] ? k.category : 'other', href = url(c.url);
    const glyph = SECTOR_ICON[k.sector];
    const facts = (k.sector ? `<div><dt>Sector</dt><dd>${glyph ? ic(glyph) : ''}${esc(k.sector)}</dd></div>` : '') +
      (k.country ? `<div><dt>Country</dt><dd><b class="dk-cc">${esc(k.country)}</b>${esc(k.countryName || regionName(k.country))}</dd></div>` : '') +
      (k.records ? `<div><dt>Size claimed</dt><dd>${esc(k.records)}</dd></div>` : '');
    const actor = k.category !== 'other' && k.actor && !HIDE_NAME.test(k.actor) ? k.actor : '';
    const source = [c.kind === 'ransomware' || HIDE_NAME.test(str(c.source)) ? '' : str(c.source), KIND_LABEL[c.kind] ?? ''].filter(Boolean).join(' · ');
    const headline = str(c.headline) || str(c.claim);
    const sentence = str(c.claim) && str(c.claim) !== headline ? str(c.claim) : '';
    const advice = (Array.isArray(c.advice) ? c.advice : []).map(str).filter(Boolean);
    const more = str(c.context) || advice.length
      ? `<details class="dk-more"><summary>${ic('i-chev')}Context and what defenders can do</summary>${str(c.context) ? `<p>${esc(c.context)}</p>` : ''}${advice.length ? `<p class="dk-sub">What defenders can do</p><ul>${advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</details>`
      : '';
    const link = href
      ? `<a class="dk-orig" href="${esc(href)}" target="_blank" rel="${c.kind === 'forum' ? 'noopener nofollow ugc' : 'noopener'}">${esc(ORIGINAL[c.kind] ?? 'Original source')}${ic('i-ext')}<span class="sr-only"> (opens in a new tab)</span></a>`
      : '<span class="dk-n">Original link unavailable</span>';
    return `<article class="dk-card kw-unit" data-cat="${cat}"><div class="dk-tile">${ic(`c-${cat}`)}<div class="dk-tb"><p class="dk-cat">${esc(k.categoryLabel)}</p>${facts ? `<dl class="dk-facts">${facts}</dl>` : ''}</div></div>` +
      `<h3 class="dk-title">${esc(headline)}</h3><p class="dk-meta">${actor ? `<span class="dk-actor">Actor: ${esc(actor)}</span>` : ''}${source ? `<span>${esc(source)}</span>` : ''}${timeTag(c.published, 'dk-time')}</p>` +
      `${sentence ? `<p class="dk-claim">${esc(sentence)}</p>` : ''}${more}<p class="dk-foot"><span class="dk-unv">Unverified claim</span>${link}</p></article>`;
  }

  // ----- 4. ransomware tracker -----
  const trackerHtml = (() => {
    const updated = timeTag(ransomware?.updated, '', true);
    const head = `<header class="dk-sech"><h2 id="dk-tracker-h">Ransomware tracker</h2>${updated ? `<p class="dk-sechmeta">Updated ${updated}</p>` : ''}</header>`;
    const credit = `<p class="dk-credit">Listings: ${external(RANSOMLOOK, 'RansomLook (ransomlook.io)')}, licensed ${external(CC_BY, 'CC BY 4.0')}. Each listing is a claim by the group on its own leak site, not a confirmed incident. Outpost shows group names, victim names and dates only, never the screenshots or files a leak site attaches.</p>`;
    if (!listings.length) return `<section class="dk-sec" id="dk-tracker" aria-labelledby="dk-tracker-h">${head}${credit}<p class="dk-lede">No leak-site listings are in the data right now.</p></section>`;
    const bars = (rows) => `<ol class="dk-bars">${rows.map(([name, n]) => `<li><span class="dk-bn">${esc(name)}</span><span class="dk-bv">${n}</span><span class="dk-bar" style="--w:${Math.max(2, Math.round((100 * n) / rows[0][1]))}%" aria-hidden="true"></span></li>`).join('')}</ol>`;
    const board = `<section class="dk-board" aria-labelledby="dk-groups-h"><h3 id="dk-groups-h">Most active groups</h3><p class="dk-boardsub">Listings in the last ${RANSOM_DAYS} days</p>${topGroups.length ? bars(topGroups.map((g) => [g.name, g.n])) : `<p class="dk-fine">No listings in the last ${RANSOM_DAYS} days.</p>`}</section>`;
    const rows = listings.slice(0, LISTING_ROWS).map((i) => {
      const victim = str(i.victim), group = groupName(i.group) || 'Unknown', href = url(i.url);
      return `<tr role="row" class="kw-unit"><td role="cell">${timeTag(i.published) || '—'}</td><td role="cell" class="dk-group">${esc(group)}</td><th role="rowheader" scope="row">${esc(victim || 'Not named')}</th>` +
        `<td role="cell">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">Group page${ic('i-ext')}<span class="sr-only"> for ${esc(group)} on RansomLook (opens in a new tab)</span></a>` : ''}</td></tr>`;
    }).join('');
    const table = `<div class="dk-listing"><h3 id="dk-latest-h">Latest ${plural(Math.min(LISTING_ROWS, listings.length), 'listing')}</h3><table class="dk-table" role="table" aria-labelledby="dk-latest-h"><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Listed</th><th role="columnheader" scope="col">Group</th><th role="columnheader" scope="col">Victim</th><th role="columnheader" scope="col"><span class="sr-only">Link</span></th></tr></thead><tbody role="rowgroup">${rows}</tbody></table></div>`;
    return `<section class="dk-sec" id="dk-tracker" aria-labelledby="dk-tracker-h">${head}${credit}<div class="dk-tracker">${board}${table}</div></section>`;
  })();

  // ----- 5. confirmed breaches -----
  const breachesHtml = (() => {
    const updated = timeTag(breaches?.updated, '', true);
    const head = `<header class="dk-sech"><h2 id="dk-breaches-h">Confirmed breaches</h2>${updated ? `<p class="dk-sechmeta">Updated ${updated}</p>` : ''}</header>`;
    const credit = `<p class="dk-credit">Source: ${external(HIBP, 'Have I Been Pwned')}, licensed under ${external(CC_BY, 'CC BY 4.0')}. Breaches added in the last ${BREACH_DAYS} days; descriptions are shortened and counts are as HIBP lists them.</p>`;
    if (!leaks.length) return `<section class="dk-sec" id="dk-breaches" aria-labelledby="dk-breaches-h">${head}${credit}<p class="dk-lede">No new breaches were added to Have I Been Pwned in the last ${BREACH_DAYS} days.</p></section>`;
    const items = leaks.slice(0, BREACH_ROWS).map((b) => {
      const href = url(b.url), count = num(b.count), classes = (Array.isArray(b.classes) ? b.classes : []).map(str).filter(Boolean), domain = str(b.domain);
      const breached = dateTag(b.breachDate), added = dateTag(b.addedDate);
      return `<li class="dk-breach kw-unit"><div class="dk-bh"><h3 class="dk-bname">${esc(str(b.name) || str(b.slug) || 'Unnamed breach')}</h3>${domain ? `<p class="dk-bdom">${esc(domain)}</p>` : ''}` +
        `${b.verified === true ? `<p class="dk-ver">${ic('i-check')}Verified breach</p>` : ''}<p class="dk-bdates">${breached ? `<span>Breached ${breached}</span>` : ''}${added ? `<span>Added to HIBP ${added}</span>` : ''}</p></div>` +
        `<div class="dk-bmain">${classes.length ? `<ul class="dk-chips">${classes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}${str(b.description) ? `<p class="dk-bdesc">${esc(b.description)}</p>` : ''}` +
        `${href ? `<a class="dk-blink" href="${esc(href)}" target="_blank" rel="noopener">Details on Have I Been Pwned${ic('i-ext')}<span class="sr-only"> (opens in a new tab)</span></a>` : ''}</div>` +
        `${count ? `<p class="dk-bcount"><strong>${count}</strong><span>accounts in HIBP</span></p>` : ''}</li>`;
    }).join('');
    const more = leaks.length > BREACH_ROWS ? `<p class="dk-fine">Showing the newest ${BREACH_ROWS} of ${leaks.length} breaches. The full list is on Have I Been Pwned.</p>` : '';
    return `<section class="dk-sec" id="dk-breaches" aria-labelledby="dk-breaches-h">${head}${credit}<ul class="dk-breaches">${items}</ul>${more}</section>`;
  })();

  // ----- 6. method note -----
  const methodHtml = `<section class="dk-sec" id="dk-method" aria-labelledby="dk-method-h"><header class="dk-sech"><h2 id="dk-method-h">How this page is made</h2></header><div class="dk-method">` +
    '<div><h3>Labels</h3><p>Categories, sectors, countries and sizes on the claim cards are assigned automatically by fixed keyword rules. They can be wrong, and a missing label means the rules found nothing, not that nothing exists.</p></div>' +
    '<div><h3>Write-ups</h3><p>An AI drafts each write-up from the title of the original post only. The headline and claim sentence restate what the post alleges; the context and advice are general background, not facts about the incident.</p></div>' +
    '<div><h3>Tracker and breaches</h3><p>Groups, victims and dates appear as RansomLook publishes them; we only merge spelling variants of a group name when counting. Fabricated, spam-list, stealer-log, sensitive and retired entries are left out of the breach list. See the <a href="/methodology/">methodology</a>.</p></div></div></section>';

  // ----- sprite: only the symbols this render references -----
  const sprite = `<svg class="dk-sprite" aria-hidden="true" focusable="false">${[...used].map((id) => `<symbol id="dk-${id}" viewBox="0 0 24 24">${ICONS[id]}</symbol>`).join('')}</svg>`;
  return `<div class="dk" id="dk">${sprite}${note}${stats}${claimsHtml}${trackerHtml}${breachesHtml}${methodHtml}</div>`;
}
