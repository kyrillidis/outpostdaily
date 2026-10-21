// Pure render step: data/editions/*.json + src/template.html -> dist/. No network, no AI —
// this is what Vercel runs on every deploy, so a build can never fail because an API did.
// Every section is its own crawlable URL (/cyber/, /warfare/, ...) with its own title,
// description, canonical and structured data.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const json = (p, fb) => (existsSync(ROOT + p) ? JSON.parse(readFileSync(ROOT + p, 'utf8')) : fb);
const site = json('config/site.json', {});
const SITE = site.url;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const href = (u) => (/^https?:\/\//.test(u) ? esc(u) : '#');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const dShort = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dLong = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dMid = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const hhmm = (iso) => new Date(iso).toISOString().slice(11, 16);
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const plain = (s) => String(s).replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// ---------- routes ----------
const ROUTES = [
  { id: 'top-stories', path: '/', nav: 'Stories', num: '01' },
  { id: 'cyber', path: '/cyber/', nav: 'Cyber', num: '02' },
  { id: 'vulns', path: '/cves/', nav: 'CVEs', num: '03' },
  { id: 'warfare', path: '/warfare/', nav: 'Warfare', num: '04' },
  { id: 'world', path: '/world/', nav: 'World', num: '05' },
  { id: 'today', path: '/today/', nav: 'Today &amp; Learn', num: '06' },
  { id: 'toolbox', path: '/toolbox/', nav: 'OSINT Toolbox', num: '07' },
  { id: 'archive', path: '/archive/', nav: 'Archive', num: '—' },
];
const PAGES = [
  { id: 'about', path: '/about/', title: 'About Outpost', desc: 'Outpost is a free daily briefing on cybersecurity, modern warfare and world news, compiled from open sources with every story linked to its outlet.' },
  { id: 'methodology', path: '/methodology/', title: 'Methodology: how Outpost is compiled', desc: 'How Outpost collects, ranks and summarises cyber, warfare and world news each day, what the AI does and does not do, and the limits of the briefing.' },
  { id: 'privacy', path: '/privacy/', title: 'Privacy policy', desc: 'Outpost has no accounts. How advertising, analytics and the email newsletter handle data.' },
];
const R = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
const SECTION_ROUTE = { cyber: R.cyber, warfare: R.warfare, world: R.world };
const SEC = { cyber: ['02', 'Cyber'], warfare: ['04', 'Warfare'], world: ['05', 'World'] };

// ---------- ads (render nothing until a slot id is configured) ----------
const adsense = site.adsense ?? {};
const ad = (name) => {
  const slot = adsense.slots?.[name];
  if (!slot) return '';
  return `<div class="ad-slot ad-${name}"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(adsense.client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
};
const withInlineAd = (htmlItems) => htmlItems.map((h, i) => (i === 2 ? h + ad('inline') : h)).join('\n');

// ---------- content blocks ----------
const head = (num, title, sub) =>
  `<div class="sec-head"><span class="sec-num">${num}</span><div><h2 class="sec-title">${title}</h2><p class="sec-sub">${sub}</p></div></div>`;
const tags = (it) => (it.tags?.length ? `<div class="tags">${it.tags.map((t) => `<button type="button" class="tag" data-kw="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '');
const sources = (it) =>
  `<div class="src">Source${it.also?.length ? 's' : ''}: <a href="${href(it.url)}" target="_blank" rel="noopener">${esc(it.source)}, ${dShort(it.published)}</a>` +
  (it.also ?? []).map((a) => ` · <a href="${href(a.url)}" target="_blank" rel="noopener">${esc(a.source)}</a>`).join('') +
  (it.also?.length ? ` <span class="sec-sub">(${it.also.length + 1} outlets)</span>` : '') + '</div>';
const why = (it, label) => (it.why ? `<p><b>${label}:</b> ${esc(it.why)}</p>` : '');

const story = (it) => `<article class="story kw-unit" id="s-${it.id}">
  <div class="story-head">${esc(it.title)}</div>
  <div class="story-meta">${esc(it.source)} · ${SEC[it.section][1]} · <time datetime="${it.published}">${dLong(it.published)}</time></div>
  <p>${esc(it.summary)}</p>
  ${it.why ? `<div class="impact"><b>Why it matters:</b> ${esc(it.why)}</div>` : ''}
  ${tags(it)}${sources(it)}
</article>`;
const item = (it, label) => `<div class="item kw-unit" id="s-${it.id}"><h3 class="item-title">${esc(it.title)}</h3><p>${esc(it.summary)}</p>${why(it, label)}${tags(it)}${sources(it)}</div>`;

function sectionHtml(ed, id, num, title, sub, label) {
  const list = ed.items.filter((i) => i.section === id);
  return head(num, title, sub) + (list.length ? withInlineAd(list.map((i) => item(i, label))) : '<p class="sec-sub">No qualifying items in the last 36 hours from the sources that responded.</p>');
}

const cvssChip = (s) => (s == null ? '<span class="chip no">—</span>' : `<span class="chip ${s >= 9 ? 'crit' : s >= 7 ? 'high' : 'med'}">${s.toFixed(1)}</span>`);
const kevTable = (kev) => head('03', 'Exploited Vulnerabilities (CISA KEV)', 'Newest additions to CISA’s Known Exploited Vulnerabilities catalog — every row is exploited in the wild') +
  `<div class="tablewrap"><table><thead><tr><th>CVE</th><th>CVSS</th><th>Product</th><th>Ransomware</th><th>Added / due</th><th>Required action</th></tr></thead><tbody>` +
  kev.map((k) => `<tr class="kw-unit"><td class="mono"><a href="${href(k.url)}" target="_blank" rel="noopener"><span class="cve">${esc(k.cve)}</span></a></td><td class="num">${cvssChip(k.cvss)}</td><td>${esc(k.vendor)} ${esc(k.product)}</td><td><span class="chip ${k.ransomware ? 'yes' : 'no'}">${k.ransomware ? 'Known' : '—'}</span></td><td class="mono">${esc(k.added)}<br>${esc(k.due)}</td><td>${esc(k.action)}</td></tr>`).join('') +
  `</tbody></table></div><p class="sec-sub">Source: CISA KEV catalog; CVSS from NVD where published. “—” means NVD has no score yet.</p>`;

function todayHtml(ed, top) {
  const learn = (ed.learn ?? []).map((l) => `<div class="card kw-unit"><h3>Learn · ${l.domain === 'cyber' ? 'Cyber' : 'Warfare'}: ${esc(l.term)}</h3><p>${esc(l.explainer)}</p><div class="src">From: <a href="${href(l.from)}" target="_blank" rel="noopener">${esc(l.fromSource)}</a></div></div>`).join('');
  const down = (ed.health ?? []).filter((h) => !h.ok);
  const aiCount = ed.items.filter((i) => i.ai).length;
  return head('06', 'Today &amp; Learn', 'The five that matter, what to do about them, and one concept per domain to take away') +
    `<div class="spread"><div class="card"><h3>Top 5, ranked</h3><ol class="rank-list" style="list-style:none;">` +
    top.slice(0, 5).map((i, n) => `<li><span class="rank-num">${n + 1}</span><div class="rank-body"><b>${esc(i.title)}</b><span>${esc(i.summary)}</span></div></li>`).join('') +
    `</ol></div><div class="card"><h3>Run today</h3>${ed.run_today?.length ? `<ul class="check-list">${ed.run_today.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="sec-sub">No AI-generated checklist today.</p>'}</div></div>` +
    (learn ? `<div class="spread" style="margin-top:20px">${learn}</div>` : '') +
    `<div class="gaps"><b>Method &amp; gaps — nothing padded to fill space</b>Every headline, link and date comes straight from the source feeds; ${aiCount} of ${ed.items.length} summaries were written by ${esc(ed.model)} from the headline and snippet only, with any number it could not find in the source thrown away. Treat summaries as pointers and read the linked source. <a href="/methodology/">Full methodology</a>.` +
    (down.length ? ` Feeds that did not respond today: ${down.map((d) => esc(d.name)).join(', ')}.` : ' All feeds responded.') + '</div>';
}

const toolboxHtml = (tb) => head('07', 'OSINT Toolbox', 'Open-source tools for checking the news yourself — verify, don’t just read') +
  tb.groups.map((g) => `<h3 class="sec-sub" style="margin:22px 0 6px">${esc(g.title)}</h3>` + g.links.map((l) => `<div class="item kw-unit"><h3 class="item-title"><a href="${href(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a></h3><p>${esc(l.desc)}</p></div>`).join('')).join('');

const archiveHtml = (rows) => head('—', 'Archive', 'Every past edition — real editions only, nothing backfilled or invented') +
  `<div class="archive-list">${rows.map((r) => `<div class="archive-row"><span class="archive-date">${dLong(r.date)} · Ed. ${r.edition}</span><span>${esc(r.text)}${r.href ? ` — <a href="/${esc(r.href)}">that edition ↑</a>` : ''}</span></div>`).join('')}</div>`;

const wireHtml = (top) => top.map((i, n) => `<div class="wire-item kw-unit"><span class="wire-rank">${String(n + 1).padStart(2, '0')}</span><div class="wire-body"><span class="wire-title"><a href="${href(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a> <span class="wire-domain">(${esc(host(i.url))})</span></span><div class="wire-meta">§${SEC[i.section][0]} · ${SEC[i.section][1]} → <a href="${SECTION_ROUTE[i.section].path}#s-${i.id}">full story</a></div></div></div>`).join('\n');

// ---------- head: meta, social, structured data ----------
const robots = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
function headMeta({ title, desc, path, type = 'website' }) {
  const url = SITE + path;
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#15181D">
<link rel="canonical" href="${url}">
<link rel="alternate" type="application/rss+xml" title="Outpost — daily briefing" href="/feed.xml">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Outpost">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Outpost — daily cyber, warfare and world news briefing">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.png">`;
}
const ld = (objs) => `<script type="application/ld+json">${JSON.stringify(objs.length === 1 ? objs[0] : objs).replace(/</g, '\\u003c')}</script>`;
const ORG = { '@type': 'NewsMediaOrganization', '@id': SITE + '/#org', name: 'Outpost', url: SITE + '/', logo: { '@type': 'ImageObject', url: SITE + '/favicon.png' }, publishingPrinciples: SITE + '/methodology/', ethicsPolicy: SITE + '/methodology/', sameAs: [site.repo] };
const WEBSITE = { '@type': 'WebSite', '@id': SITE + '/#site', url: SITE + '/', name: 'Outpost', inLanguage: 'en', publisher: { '@id': SITE + '/#org' } };
function jsonLd({ title, desc, path, crumbs, list, modified }) {
  const nodes = [{ '@context': 'https://schema.org', '@graph': [ORG, WEBSITE,
    { '@type': 'CollectionPage', '@id': SITE + path + '#page', url: SITE + path, name: title, description: desc, inLanguage: 'en', isPartOf: { '@id': SITE + '/#site' }, publisher: { '@id': SITE + '/#org' }, ...(modified && { dateModified: modified }) },
    ...(path !== '/' ? [{ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Outpost', item: SITE + '/' }, ...crumbs.map((c, n) => ({ '@type': 'ListItem', position: n + 2, name: c[0], item: SITE + c[1] }))] }] : []),
    ...(list?.length ? [{ '@type': 'ItemList', itemListOrder: 'https://schema.org/ItemListOrderDescending', numberOfItems: list.length, itemListElement: list.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.title, url: i.url })) }] : []),
  ] }];
  return ld(nodes);
}

// ---------- assemble ----------
const dir = ROOT + 'data/editions/';
const editions = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse().map((f) => JSON.parse(readFileSync(dir + f, 'utf8'))) : [];
if (!editions.length) { console.error('No editions in data/editions — run `npm run fetch` first.'); process.exit(1); }
const template = readFileSync(ROOT + 'src/template.html', 'utf8');
const toolbox = json('config/toolbox.json', { groups: [] });
const legacy = json('data/archive-legacy.json', []);
const archiveRows = [
  ...editions.map((e) => ({ date: e.date, edition: e.edition, text: [...e.items].sort((a, b) => b.score - a.score).slice(0, 3).map((i) => i.title.replace(/[.\s]+$/, '')).join('; ') + '.', href: `archive/${e.date}.html` })),
  ...legacy,
];
const footerLinks = [['/about/', 'About'], ['/methodology/', 'Methodology'], ['/privacy/', 'Privacy'], ['/feed.xml', 'RSS'], [site.repo, 'Source code']].map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('');

function render({ ed, route, main, title, desc, path, crumbs = [], list = [] }) {
  const ranked = [...ed.items].sort((a, b) => b.score - a.score);
  const ok = (ed.health ?? []).filter((h) => h.ok).length;
  const isHome = path === '/';
  const nav = ROUTES.map((r) => `<a href="${r.path}"${r.id === route ? ' class="active" aria-current="page"' : ''}><b>${r.num}</b>${r.nav}</a>`).join('\n      ');
  const vars = {
    HEAD_META: headMeta({ title, desc, path }),
    JSONLD: jsonLd({ title, desc, path, crumbs, list, modified: ed.compiled }),
    NAV: nav,
    WORDMARK: isHome
      ? '<h1 class="wordmark">OUTPOST<span class="dot">.</span><span class="sr-only"> — daily cybersecurity, modern warfare and world news briefing</span></h1>'
      : '<div class="wordmark"><a href="/" style="color:inherit;text-decoration:none">OUTPOST<span class="dot">.</span></a></div>',
    MAIN: main,
    AD_SIDEBAR: ad('sidebar'),
    FOOTER_LINKS: footerLinks,
    EDITION: ed.edition,
    COMPILED: `${hhmm(ed.compiled)} UTC · ${dLong(ed.compiled)}`,
    META_TODAY: `${ok} sources · ${ed.items.length} stories · ${ed.kev.length} tracked CVEs`,
    WIRE_COUNT: Math.min(20, ranked.length),
    FOOTER_STAMP: `Compiled from open-source reporting and CISA/NVD data, ${hhmm(ed.compiled)} UTC, ${dLong(ed.compiled)}.`,
  };
  let html = template.replace(/<!--GEN:wire-->[\s\S]*?<!--\/GEN:wire-->/, () => `<!--GEN:wire-->${wireHtml(ranked.slice(0, 20))}<!--/GEN:wire-->`);
  html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  // one <h1> per page: the section title (the wordmark is an h1 only on the home page)
  if (!isHome) html = html.replace(/<h2 class="sec-title">([\s\S]*?)<\/h2>/, '<h1 class="sec-title">$1</h1>');
  return html;
}

function pageFor(ed, route) {
  const ranked = [...ed.items].sort((a, b) => b.score - a.score);
  const d = dMid(ed.compiled);
  const heads = (sec, n) => ranked.filter((i) => i.section === sec).slice(0, n).map((i) => plain(i.title).replace(/[.\s]+$/, ''));
  const per = (s) => ranked.filter((i) => i.section === s).slice(0, 2);
  const front = [per('cyber')[0], per('warfare')[0], per('world')[0], per('cyber')[1], per('warfare')[1], per('world')[1]].filter(Boolean);
  const secList = (s) => ranked.filter((i) => i.section === s);
  const r = R[route];
  const cfg = {
    'top-stories': { title: `Outpost: Cyber, Warfare & World News Briefing — ${d}`, desc: cut(`Today’s top stories: ${[...heads('cyber', 1), ...heads('warfare', 1), ...heads('world', 1)].join('; ')}. Daily, source-linked briefing.`, 158), main: head('01', 'Top Stories', 'The best of cyber, warfare and world — two from each, ranked by recency, source weight and how many outlets carry it') + ad('top') + withInlineAd(front.map(story)), list: front },
    cyber: { title: `Cybersecurity News Today — ${d} | Outpost`, desc: cut(`Cyber threat news for ${d}: ${heads('cyber', 3).join('; ')}. Breaches, campaigns and advisories, linked to source.`, 158), main: ad('top') + sectionHtml(ed, 'cyber', '02', 'Cyber Threat Intelligence', 'Breaches, campaigns, advisories and research', 'What to check'), list: secList('cyber') },
    vulns: { title: `Newly Exploited Vulnerabilities (CISA KEV) — ${d} | Outpost`, desc: cut(`The newest CVEs CISA lists as exploited in the wild, with CVSS scores and required actions: ${ed.kev.slice(0, 4).map((k) => k.cve).join(', ')} and more.`, 158), main: kevTable(ed.kev), list: [] },
    warfare: { title: `Modern Warfare News & Analysis — ${d} | Outpost`, desc: cut(`Modern warfare today (${d}): ${heads('warfare', 3).join('; ')}. Operations, systems and analysis with sources.`, 158), main: ad('top') + sectionHtml(ed, 'warfare', '04', 'Modern Warfare', 'Operations, systems and analysis — from analysts, defense press and open-source investigators', 'Why it matters'), list: secList('warfare') },
    world: { title: `World News Briefing for Security Readers — ${d} | Outpost`, desc: cut(`World news for ${d} through a security lens: ${heads('world', 3).join('; ')}.`, 158), main: ad('top') + sectionHtml(ed, 'world', '05', 'World', 'The general news that moves the security picture', 'Why it matters'), list: secList('world') },
    today: { title: `Today’s Top 5 & What to Learn — ${d} | Outpost`, desc: cut(`The five stories that matter on ${d}, a defender checklist, and today’s cyber and warfare concepts explained: ${(ed.learn ?? []).map((l) => l.term).join(', ')}.`, 158), main: todayHtml(ed, ranked), list: ranked.slice(0, 5) },
    toolbox: { title: 'OSINT Toolbox: Free Tools to Verify News Yourself | Outpost', desc: 'A curated list of free open-source intelligence tools for conflict mapping, flight and ship tracking, threat intelligence and image verification.', main: toolboxHtml(toolbox), list: [] },
    archive: { title: 'Archive: Past Daily Briefings | Outpost', desc: 'Every past Outpost edition — daily cybersecurity, modern warfare and world news briefings.', main: archiveHtml(archiveRows), list: [] },
  }[route];
  const crumbs = route === 'top-stories' ? [] : [[plain(r.nav), r.path]];
  return render({ ed, route, path: r.path, crumbs, ...cfg });
}

function editionPage(ed) {
  const ranked = [...ed.items].sort((a, b) => b.score - a.score);
  const d = dLong(ed.compiled);
  const path = `/archive/${ed.date}.html`;
  const main = `<div class="sec-head"><span class="sec-num">${ed.edition}</span><div><h2 class="sec-title">Edition ${ed.edition} — ${d}</h2><p class="sec-sub">Cyber, warfare and world news as compiled on ${d}</p></div></div>` +
    sectionHtml(ed, 'cyber', '02', 'Cyber', 'Breaches, campaigns, advisories and research', 'What to check') +
    sectionHtml(ed, 'warfare', '04', 'Warfare', 'Operations, systems and analysis', 'Why it matters') +
    sectionHtml(ed, 'world', '05', 'World', 'General news that moves the security picture', 'Why it matters') + kevTable(ed.kev);
  const top = ranked.slice(0, 3).map((i) => plain(i.title).replace(/[.\s]+$/, ''));
  return render({ ed, route: 'archive', path, crumbs: [['Archive', '/archive/'], [d, path]], title: `Cyber, Warfare & World News — ${d} | Outpost`, desc: cut(`Edition ${ed.edition}, ${d}: ${top.join('; ')}.`, 158), main, list: ranked });
}

function staticPage(ed, pg) {
  const body = readFileSync(`${ROOT}src/pages/${pg.id}.html`, 'utf8');
  const html = render({ ed, route: pg.id, path: pg.path, crumbs: [[pg.title, pg.path]], title: `${pg.title} | Outpost`, desc: pg.desc, main: `<div class="sec-head"><span class="sec-num">—</span><div><h2 class="sec-title">${esc(pg.title)}</h2></div></div>${body}` });
  return html;
}

// ---------- write ----------
const out = ROOT + 'dist/';
rmSync(out, { recursive: true, force: true });
mkdirSync(out + 'archive', { recursive: true });
cpSync(ROOT + 'public', out, { recursive: true });
const put = (path, html) => {
  const file = path.endsWith('/') ? out + path.slice(1) + 'index.html' : out + path.slice(1);
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  writeFileSync(file, html);
};
const latest = editions[0];
for (const r of ROUTES) put(r.path, pageFor(latest, r.id));
for (const p of PAGES) put(p.path, staticPage(latest, p));
for (const e of editions) put(`/archive/${e.date}.html`, editionPage(e));

// RSS: latest three editions, links point at our own per-story anchors
const rssItems = [];
const seen = new Set();
for (const e of editions.slice(0, 3)) for (const i of [...e.items].sort((a, b) => b.score - a.score)) {
  if (seen.has(i.id)) continue;
  seen.add(i.id);
  rssItems.push(`<item><title>${esc(plain(i.title))}</title><link>${SITE}/archive/${e.date}.html#s-${i.id}</link><guid isPermaLink="false">outpost-${i.id}</guid><pubDate>${new Date(i.published).toUTCString()}</pubDate><category>${SEC[i.section][1]}</category><description>${esc(i.summary)} (Source: ${esc(i.source)})</description></item>`);
}
writeFileSync(out + 'feed.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Outpost — daily cyber, warfare and world briefing</title><link>${SITE}/</link><atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/><description>A daily, source-linked briefing on cybersecurity, modern warfare and world news.</description><language>en</language><lastBuildDate>${new Date(latest.compiled).toUTCString()}</lastBuildDate>\n${rssItems.join('\n')}\n</channel></rss>\n`);

// sitemap: routes + pages + every edition (incl. legacy archive files shipped in public/)
const old = existsSync(ROOT + 'public/archive') ? readdirSync(ROOT + 'public/archive').map((f) => f.match(/^(\d{4}-\d{2}-\d{2})\.html$/)?.[1]).filter(Boolean) : [];
const dates = [...new Set([...editions.map((e) => e.date), ...old])].sort().reverse();
const u = (path, lastmod, freq, pri) => `  <url><loc>${SITE}${path}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
writeFileSync(out + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [...ROUTES.map((r) => u(r.path, latest.date, r.id === 'toolbox' ? 'monthly' : 'daily', r.path === '/' ? '1.0' : '0.8')),
   ...PAGES.map((p) => u(p.path, latest.date, 'yearly', '0.3')),
   ...dates.map((d) => u(`/archive/${d}.html`, d, 'never', '0.4'))].join('\n') + '\n</urlset>\n');
console.log(`rendered ${ROUTES.length} routes, ${PAGES.length} pages, ${editions.length} edition(s); latest ${latest.date} (Ed. ${latest.edition})`);
