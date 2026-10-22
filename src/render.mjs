// Pure render step: data/editions/*.json + src/template.html -> dist/. No network, no AI —
// this is what Vercel runs on every deploy, so a build can never fail because an API did.
// Every section is its own crawlable URL (/cyber/, /warfare/, ...) with its own title,
// description, canonical and structured data.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = (p, fb) => (existsSync(ROOT + p) ? JSON.parse(readFileSync(ROOT + p, 'utf8')) : fb);
const site = json('config/site.json', {});
const SITE = site.url;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const href = (u) => (/^https?:\/\//.test(u) ? esc(u) : '#');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const dLong = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dMid = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dMonth = (iso) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const hhmm = (iso) => new Date(iso).toISOString().slice(11, 16);
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const plain = (s) => String(s).replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- routes ----------
const ROUTES = [
  { id: 'top-stories', path: '/', nav: 'Stories', tab: 'home' },
  { id: 'cyber', path: '/cyber/', nav: 'Cyber', tab: 'cyber' },
  { id: 'vulns', path: '/cves/', nav: 'CVEs', tab: 'cves' },
  { id: 'warfare', path: '/warfare/', nav: 'Warfare', tab: 'warfare' },
  { id: 'geo', path: '/geopolitics/', nav: 'Geopolitics', tab: 'geo' },
  { id: 'today', path: '/today/', nav: 'Today &amp; Learn', tab: 'today' },
  { id: 'toolbox', path: '/toolbox/', nav: 'OSINT Toolbox', tab: 'toolbox' },
  { id: 'archive', path: '/archive/', nav: 'Archive', tab: 'archive' },
];
const PAGES = [
  { id: 'about', path: '/about/', title: 'About Outpost', seoTitle: 'About Outpost: a free daily briefing on cyber, warfare and geopolitics', desc: 'Outpost is a free daily briefing on cybersecurity, modern warfare technology, geodata and geopolitics, compiled from open sources with every story linked to its outlet.' },
  { id: 'methodology', path: '/methodology/', title: 'Methodology: how Outpost is compiled', desc: 'How Outpost collects, ranks and summarises cyber, warfare technology and geopolitics news each day, what the AI does and does not do, and the limits of the briefing.' },
  { id: 'glossary', path: '/glossary/', title: 'Glossary: cyber, warfare and geopolitics terms', desc: 'Plain-language definitions of the terms used in the briefing, from CVE, CVSS and KEV to GNSS jamming, electronic warfare, loitering munitions and hybrid warfare.' },
  { id: 'privacy', path: '/privacy/', title: 'Privacy policy', desc: 'Outpost has no accounts. How advertising, analytics, fonts, the email newsletter and browser storage handle data.' },
];
const R = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
const SECTION_ROUTE = { cyber: R.cyber, warfare: R.warfare, geo: R.geo };
const DOMAIN_LABEL = { cyber: 'Cyber', warfare: 'Warfare', geo: 'Geopolitics' };
const LEARN_LABEL = { cyber: 'Cyber', warfare: 'Warfare', geo: 'Geopolitics &amp; geodata' };
const WHY_LABEL = { cyber: 'What to check', warfare: 'Why it matters', geo: 'Strategic relevance' };

// ---------- imagery: generated plates (src/plates.mjs) and credited photos (config/images.json) ----------
let makePlate = null;
try { ({ plate: makePlate } = await import('./plates.mjs')); } catch { /* optional: pages render without illustrations */ }
const plateHtml = (spec, variant) => { try { return makePlate ? makePlate({ tags: [], title: '', ...spec, variant }) : ''; } catch { return ''; } };
const images = json('config/images.json', { slots: {} }).slots ?? {};
const photoFigure = (slot, { priority = false } = {}) => {
  const im = images[slot];
  if (!im?.src || !im.width || !im.height) return '';
  const srcset = im.src800 ? ` srcset="${esc(im.src800)} 800w, ${esc(im.src)} ${im.width}w" sizes="(min-width:1180px) 800px, 100vw"` : '';
  const credit = `Photo (cropped, tinted): ${esc(im.credit || 'see About page')}${im.creditUrl ? ` (<a href="${href(im.creditUrl)}" target="_blank" rel="noopener">${esc(im.license || 'source')}</a>)` : ''}`;
  return `<figure class="banner" data-slot="${slot}"><img src="${esc(im.src)}"${srcset} width="${im.width}" height="${im.height}" alt="${esc(im.alt ?? '')}" decoding="async"${priority ? ' fetchpriority="high"' : ' loading="lazy"'}><figcaption class="banner-credit">${credit}</figcaption></figure>`;
};
const mastheadArt = () => {
  const im = images.masthead;
  if (!im?.src || !im.width || !im.height) return '';
  const srcset = im.src800 ? ` srcset="${esc(im.src800)} 800w, ${esc(im.src)} ${im.width}w" sizes="100vw"` : '';
  return `<figure class="brand-art" aria-hidden="true"><img src="${esc(im.src)}"${srcset} width="${im.width}" height="${im.height}" alt="" decoding="async"></figure>`;
};
// pages without a photo slot get a generated banner plate with a fixed motif
const PAGE_ART = {
  cyber: { section: 'cyber', motif: 'graph' },
  warfare: { section: 'warfare', motif: 'radar' },
  geo: { section: 'geo', motif: 'topo' },
  vulns: { section: 'cyber', motif: 'matrix' },
  today: { section: 'warfare', motif: 'signal' },
  toolbox: { section: 'geo', motif: 'orbit' },
  archive: { section: 'cyber', motif: 'chart' },
  glossary: { section: 'geo', motif: 'constellation' },
  about: { section: 'geo', motif: 'perimeter' },
};
const bannerFor = (route, section) => (['cyber', 'warfare', 'geo'].includes(section) && photoFigure(section, { priority: true })) ||
  (route === 'about' && photoFigure('about', { priority: true })) ||
  (PAGE_ART[route] ? plateHtml({ id: `page-${route}`, ...PAGE_ART[route] }, 'banner') : '');

// ---------- ads (render nothing until a slot id is configured) ----------
const adsense = site.adsense ?? {};
const ad = (name) => {
  const slot = adsense.slots?.[name];
  if (!slot) return '';
  return `<div class="ad-slot ad-${name}"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(adsense.client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
};

// ---------- glossary ----------
const glossary = json('config/glossary.json', { terms: [], pages: {} });
const gBy = Object.fromEntries(glossary.terms.map((t) => [t.slug, t]));
const glossSlug = (term) => glossary.terms.find((g) => [g.term, g.full].some((x) => x && norm(x) === norm(term)))?.slug;
const termsPanel = (page) => {
  const slugs = (glossary.pages?.[page] ?? []).filter((s) => gBy[s]);
  if (!slugs.length) return '';
  return `<details class="terms"><summary><svg class="icon chev" aria-hidden="true"><use href="#i-chevron"/></svg>New to this? Key terms for this page</summary><dl class="terms-list">${slugs.map((s) => `<div class="term"><dt><a href="/glossary/#${s}">${esc(gBy[s].term)}</a></dt><dd>${esc(gBy[s].def)}</dd></div>`).join('')}</dl><p><a href="/glossary/">Open the full glossary</a></p></details>`;
};

// ---------- content blocks ----------
const secHead = ({ title, sub = '', art = '' }) =>
  `<header class="sec-head${art ? ' has-banner' : ''}">${art}<div class="sec-head-text"><h2 class="sec-title">${title}</h2>${sub ? `<p class="sec-sub">${sub}</p>` : ''}</div></header>`;
const chip = (sec) => `<span class="chip chip-domain" data-domain="${sec}"><svg class="icon" aria-hidden="true"><use href="#i-${sec}"/></svg>${DOMAIN_LABEL[sec]}</span>`;
const tagList = (it) => (it.tags?.length ? `<ul class="tags">${it.tags.map((t) => `<li><button type="button" class="tag" data-kw="${esc(t)}">${esc(t)}</button></li>`).join('')}</ul>` : '');

function entry(it, { n, lvl = 3, lead = false }) {
  const corr = it.also?.length ? ` <span class="corr">${it.also.length + 1} outlets</span>` : '';
  const cites = [{ source: it.source, url: it.url }, ...(it.also ?? [])]
    .map((c, i) => `<a class="cite" href="${href(c.url)}" target="_blank" rel="noopener"><sup>${i + 1}</sup>${esc(c.source)}</a>`).join('');
  return `<article class="entry kw-unit${lead ? ' entry-lead' : ''}" id="s-${it.id}" data-domain="${it.section}" data-rank="${n}">
  ${plateHtml({ id: it.id, section: it.section, title: it.title, tags: it.tags ?? [] }, 'card')}
  <div class="entry-body">
    <h${lvl} class="entry-title"><span class="entry-no" aria-hidden="true">${String(n).padStart(2, '0')}</span><a href="${href(it.url)}" target="_blank" rel="noopener">${esc(it.title)}<svg class="icon ext" aria-hidden="true"><use href="#i-external"/></svg><span class="sr-only"> (opens the original article)</span></a></h${lvl}>
    <p class="entry-line">${chip(it.section)} <span class="entry-outlet">${esc(it.source)}</span> <time datetime="${it.published}">${dMid(it.published)}</time>${corr}</p>
    <p class="entry-sum">${esc(it.summary)}</p>
    ${it.why ? `<p class="entry-why"><span class="why-label">${WHY_LABEL[it.section]}</span>${esc(it.why)}</p>` : ''}
    ${tagList(it)}
    <p class="cites"><span class="cites-label">Sources</span>${cites}</p>
  </div>
</article>`;
}
const entriesHtml = (items, { lvl, className = 'entries', inlineAd = true } = {}) =>
  `<div class="${className}">${items.map((it, i) => entry(it, { n: i + 1, lvl }) + (inlineAd && i === 2 ? ad('inline') : '')).join('\n')}</div>`;

function sectionPage(ed, section, { title, sub, lvl, route }) {
  const list = ed.items.filter((i) => i.section === section);
  const body = list.length
    ? entriesHtml(list, { lvl })
    : '<p class="sec-sub">No qualifying items in the last 36 hours from the sources that responded.</p>';
  return secHead({ title, sub, art: bannerFor(route, section) }) + ad('top') + termsPanel(route) + body;
}

const sevClass = (s) => (s == null ? 'sev-none' : s >= 9 ? 'sev-crit' : s >= 7 ? 'sev-high' : 'sev-med');
const sevText = (s) => (s == null ? 'No score' : s >= 9 ? 'Critical' : s >= 7 ? 'High' : s >= 4 ? 'Medium' : 'Low');
const kevTable = (kev, { head = true } = {}) =>
  (head ? secHead({ title: 'Exploited vulnerabilities (CISA KEV)', sub: 'The newest additions to CISA’s Known Exploited Vulnerabilities catalogue. Every row is being exploited in the wild.', art: bannerFor('vulns') }) + termsPanel('cves') : '') +
  `<div class="kev-wrap"><table class="kev"><caption class="sr-only">Newest CISA Known Exploited Vulnerabilities with severity, affected product, ransomware use and required action</caption><thead><tr><th scope="col">CVE</th><th scope="col">CVSS</th><th scope="col">Product</th><th scope="col">Ransomware</th><th scope="col">Added / due</th><th scope="col">Required action</th></tr></thead><tbody>` +
  kev.map((k) => `<tr class="kev-row kw-unit"><th scope="row" class="kev-cve"><a class="cve" href="${href(k.url)}" target="_blank" rel="noopener">${esc(k.cve)}</a></th><td data-label="CVSS"><span class="sev ${sevClass(k.cvss)}"><span class="sev-score">${k.cvss == null ? '—' : k.cvss.toFixed(1)}</span><span class="sev-text">${sevText(k.cvss)}</span></span></td><td data-label="Product">${esc(k.vendor)} ${esc(k.product)}</td><td data-label="Ransomware"><span class="flag ${k.ransomware ? 'flag-yes' : 'flag-no'}">${k.ransomware ? 'Known' : 'None known'}</span></td><td data-label="Added / due"><time datetime="${esc(k.added)}">${esc(k.added)}</time> → <time datetime="${esc(k.due)}">${esc(k.due)}</time></td><td data-label="Required action">${esc(k.action)}</td></tr>`).join('') +
  `</tbody></table></div><p class="sec-sub">Source: CISA KEV catalogue; CVSS scores from NVD where published. “No score” means NVD has not scored it yet.</p>`;

function todayHtml(ed, top) {
  const checks = (ed.run_today ?? []).map((r, i) => `<li><label><input type="checkbox" data-check-id="run-${i}"><span>${esc(r)}</span></label></li>`).join('');
  const learn = (ed.learn ?? []).map((l) => {
    const slug = glossSlug(l.term);
    return `<article class="learn-item kw-unit" data-domain="${l.domain}"><h3 class="learn-term">${esc(l.term)}</h3><p class="learn-def">${esc(l.explainer)}</p><p class="learn-from">${chip(l.domain)} From <a href="${href(l.from)}" target="_blank" rel="noopener">${esc(l.fromSource)}</a>${slug ? ` · <a href="/glossary/#${slug}">In the glossary</a>` : ''}</p></article>`;
  }).join('');
  const down = (ed.health ?? []).filter((h) => !h.ok);
  const aiCount = ed.items.filter((i) => i.ai).length;
  return secHead({ title: 'Today &amp; Learn', sub: 'The five stories that matter, what to check, and one concept per domain to take away.', art: bannerFor('today') }) + termsPanel('today') +
    `<div class="brief"><section aria-labelledby="top5-h"><h2 class="group-title" id="top5-h">Top 5, ranked</h2><ol class="rank-list">` +
    top.slice(0, 5).map((i, n) => `<li class="kw-unit"><span class="rank-num">${n + 1}</span><div><a class="rank-title" href="${href(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a><p>${esc(i.summary)}</p></div></li>`).join('') +
    `</ol></section><section aria-labelledby="run-h"><h2 class="group-title" id="run-h">Run today</h2>${checks ? `<ul class="checklist">${checks}</ul>` : '<p class="sec-sub">No AI-generated checklist today.</p>'}</section></div>` +
    (learn ? `<section class="learn" aria-labelledby="learn-h"><h2 class="group-title" id="learn-h">Learn today</h2>${learn}</section>` : '') +
    `<aside class="method"><h2 class="method-title">Method and gaps</h2><p>Every headline, link and date comes straight from the source feeds. ${aiCount} of ${ed.items.length} summaries were written by ${esc(ed.model)} from the headline and snippet only, and any figure it could not find in the source text was discarded. Treat summaries as pointers and read the linked source. The checklist and concepts are also model-written from today’s headlines: a prompt for your own judgement, not security advice. Illustrations are generated, not photographs of the events. <a href="/methodology/">Full methodology</a>.` +
    (down.length ? ` Feeds that did not respond today: ${down.map((d) => esc(d.name)).join(', ')}.` : ' All feeds responded.') + '</p></aside>';
}

const toolboxHtml = (tb) => secHead({ title: 'OSINT Toolbox', sub: 'Open-source tools for checking the news yourself. Verify, don’t just read.', art: bannerFor('toolbox') }) + termsPanel('toolbox') +
  tb.groups.map((g) => `<section class="tool-group"><h2 class="group-title">${esc(g.title)}</h2><ul class="tools">${g.links.map((l) => `<li class="tool kw-unit"><a class="tool-name" href="${href(l.url)}" target="_blank" rel="noopener">${esc(l.name)}<svg class="icon ext" aria-hidden="true"><use href="#i-external"/></svg></a><p class="tool-desc">${esc(l.desc)}</p></li>`).join('')}</ul></section>`).join('');

function archiveHtml(rows) {
  const months = [];
  for (const r of rows) {
    const key = dMonth(r.date);
    (months.find((m) => m.key === key) ?? months[months.push({ key, rows: [] }) - 1]).rows.push(r);
  }
  return secHead({ title: 'Archive', sub: 'Every past edition. Real editions only; nothing is backfilled or invented.', art: bannerFor('archive') }) +
    months.map((m) => `<section class="archive-month"><h2 class="group-title">${m.key}</h2><ol class="archive-list">${m.rows.map((r) => {
      const label = `${dDay(r.date)} · Ed. ${r.edition}`;
      return `<li class="archive-row kw-unit">${r.href ? `<a class="archive-date" href="/${esc(r.href)}">${label}</a>` : `<span class="archive-date">${label}</span>`}<span class="archive-text">${esc(r.text)}</span></li>`;
    }).join('')}</ol></section>`).join('');
}

function glossaryHtml(body) {
  const group = (d, label) => `<section class="gloss-group" data-domain="${d}"><h2>${label}</h2><dl class="glossary">${glossary.terms.filter((t) => t.domain === d).map((t) => `<div class="gloss kw-unit" id="${t.slug}"><dt>${esc(t.term)}${t.full ? `<span class="gloss-full">${esc(t.full)}</span>` : ''}</dt><dd>${esc(t.def)}${t.see ? ` <a href="${href(t.see)}" target="_blank" rel="noopener">Learn more</a>` : ''}</dd></div>`).join('')}</dl></section>`;
  return body + group('cyber', 'Cyber') + group('warfare', 'Warfare') + group('geo', 'Geopolitics &amp; geodata');
}

const wireHtml = (top, base) => top.map((i, n) => `<li class="wire-item kw-unit" data-domain="${i.section}"><a class="wire-link" href="${href(i.url)}" target="_blank" rel="noopener"><span class="wire-rank">${String(n + 1).padStart(2, '0')}</span><span class="wire-headline">${esc(i.title)}</span></a><span class="wire-meta">${chip(i.section)}<span class="wire-host">${esc(host(i.url))}</span><a class="wire-more" href="${base ?? SECTION_ROUTE[i.section].path}#s-${i.id}">Entry<span class="sr-only"> for ${esc(i.title)}</span></a></span></li>`).join('\n');

// ---------- about page: FAQ and photo credits ----------
const FAQ = [
  ['What is Outpost?', 'A free daily briefing on cybersecurity, modern warfare technology and geopolitics, compiled automatically from open sources. Every story links to the outlet that reported it.'],
  ['How often is it updated?', 'Once a day. A scheduled job collects stories from the previous 36 hours, ranks them and publishes a new edition. Each page shows when it was last compiled.'],
  ['Do I need an account or to pay?', 'No. There are no accounts and no paywall. Outpost may show advertising, and promotes Cylist in a labelled card.'],
  ['Can I trust the summaries?', 'Treat them as pointers. A language model writes each short summary from the outlet’s headline and snippet only, and any figure it cannot find in that source text is discarded. Read the original article before acting on anything.'],
  ['Who publishes Outpost?', 'Outpost is published by the maker of Cylist, a threat-intelligence triage tool that is promoted on this site. Ranking is automatic, and no outlet or company can pay to be included or ranked higher.'],
  ['How do I suggest a source or report a mistake?', 'Open an issue on GitHub. The whole pipeline, including the list of sources, is public.'],
];
const faqHtml = () => `<div class="faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
const creditsHtml = () => {
  const rows = Object.entries(images).filter(([, im]) => im?.src).map(([slot, im]) => `<li><strong>${esc(slot === 'geo' ? 'Geopolitics' : slot[0].toUpperCase() + slot.slice(1))} banner:</strong> ${esc(im.title || 'photograph')}${im.credit ? `, ${esc(im.credit)}` : ''}${im.license ? `, ${esc(im.license)}` : ''}${im.creditUrl ? ` (<a href="${href(im.creditUrl)}" target="_blank" rel="noopener">source</a>)` : ''}</li>`);
  return rows.length ? `<h2>Photo credits</h2><ul class="credits">${rows.join('')}</ul><p class="credits">Photographs are cropped, converted to greyscale and tinted in each section’s colour for use on this site.</p>` : '';
};

// ---------- head: meta, social, structured data ----------
const robots = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
function headMeta({ title, desc, path, type = 'website', publishedTime }) {
  const url = SITE + path;
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="Outpost">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#0F1411" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#ECEEE9" media="(prefers-color-scheme: light)">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" type="application/rss+xml" title="Outpost — daily briefing" href="/feed.xml">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Outpost">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Outpost — cyber, defence tech and geopolitics briefing">
${publishedTime ? `<meta property="article:published_time" content="${esc(publishedTime)}">\n` : ''}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.jpg">`;
}
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const ORG = { '@type': 'NewsMediaOrganization', '@id': SITE + '/#org', name: 'Outpost', url: SITE + '/', logo: { '@type': 'ImageObject', url: SITE + '/logo.png', width: 512, height: 512 }, publishingPrinciples: SITE + '/methodology/', ethicsPolicy: SITE + '/methodology/', sameAs: [site.repo] };
const WEBSITE = { '@type': 'WebSite', '@id': SITE + '/#site', url: SITE + '/', name: 'Outpost', inLanguage: 'en', publisher: { '@id': SITE + '/#org' } };
function jsonLd({ title, desc, path, crumbs = [], list = [], modified, article = false, type = 'CollectionPage', faq = null, terms = null }) {
  const page = article
    ? { '@type': 'NewsArticle', '@id': SITE + path + '#article', headline: cut(title, 110), description: desc, url: SITE + path, mainEntityOfPage: SITE + path, inLanguage: 'en', datePublished: modified, dateModified: modified, author: { '@id': SITE + '/#org' }, publisher: { '@id': SITE + '/#org' }, image: [SITE + '/og.jpg'], isPartOf: { '@id': SITE + '/#site' } }
    : { '@type': type, '@id': SITE + path + '#page', url: SITE + path, name: title, description: desc, inLanguage: 'en', isPartOf: { '@id': SITE + '/#site' }, publisher: { '@id': SITE + '/#org' }, ...(modified && { dateModified: modified }) };
  const graph = [ORG, WEBSITE, page];
  if (path !== '/') graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Outpost', item: SITE + '/' }, ...crumbs.map((c, n) => ({ '@type': 'ListItem', position: n + 2, name: c[0], item: SITE + c[1] }))] });
  if (list.length) graph.push({ '@type': 'ItemList', itemListOrder: 'https://schema.org/ItemListOrderDescending', numberOfItems: list.length, itemListElement: list.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.title, url: i.url })) });
  if (faq) graph.push({ '@type': 'FAQPage', '@id': SITE + path + '#faq', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  if (terms) graph.push({ '@type': 'DefinedTermSet', '@id': SITE + '/glossary/#set', name: 'Outpost glossary', hasDefinedTerm: terms.map((t) => ({ '@type': 'DefinedTerm', name: t.term, description: t.def, url: SITE + '/glossary/#' + t.slug, inDefinedTermSet: SITE + '/glossary/#set' })) });
  return ld({ '@context': 'https://schema.org', '@graph': graph });
}

// ---------- hashed static assets (src/assets/app.css|js -> dist/assets/app.<hash>.css|js) ----------
const ASSETS = {};
const assetFiles = {};
for (const [key, name] of [['css', 'app.css'], ['js', 'app.js']]) {
  const file = ROOT + 'src/assets/' + name;
  if (!existsSync(file)) { ASSETS[key] = ''; continue; }
  const body = readFileSync(file);
  const hashed = name.replace(/(\.\w+)$/, `.${createHash('sha1').update(body).digest('hex').slice(0, 8)}$1`);
  ASSETS[key] = '/assets/' + hashed;
  assetFiles[hashed] = body;
}

// ---------- assemble ----------
const dir = ROOT + 'data/editions/';
const editions = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse().map((f) => JSON.parse(readFileSync(dir + f, 'utf8'))) : [];
for (const e of editions) for (const i of e.items) if (i.section === 'world') i.section = 'geo';
if (!editions.length) { console.error('No editions in data/editions — run `npm run fetch` first.'); process.exit(1); }
const template = readFileSync(ROOT + 'src/template.html', 'utf8');
const toolbox = json('config/toolbox.json', { groups: [] });
const legacy = json('data/archive-legacy.json', []);
const archiveRows = [
  ...editions.map((e) => ({ date: e.date, edition: e.edition, text: [...e.items].sort((a, b) => b.score - a.score).slice(0, 3).map((i) => i.title.replace(/[.\s]+$/, '')).join('; ') + '.', href: `archive/${e.date}.html` })),
  ...legacy,
];
const promo = site.promo;
const promoHtml = () => (promo ? `<aside class="promo" aria-label="${esc(promo.name)}"><h2 class="promo-name">${esc(promo.name)}</h2><p class="promo-tag">${esc(promo.label)}</p><p class="promo-text">${esc(promo.text)}</p><a class="btn promo-cta" href="${esc(promo.url)}/?utm_source=outpost&amp;utm_medium=sidebar" target="_blank" rel="noopener">Try ${esc(promo.name)}<svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a><p class="promo-note">${esc(promo.name)} is made by Outpost’s publisher.</p></aside>` : '');
const footerLinks = [['/about/', 'About'], ['/methodology/', 'Methodology'], ['/glossary/', 'Glossary'], ...(promo ? [[promo.url + '/?utm_source=outpost&utm_medium=footer', promo.name]] : []), ['/privacy/', 'Privacy'], ['/feed.xml', 'RSS'], [site.repo, 'Source code']]
  .map(([h, t]) => `<li><a href="${esc(h)}">${t}</a></li>`).join('');

function render({ ed, route, main, title, desc, path, crumbs = [], list = [], article = false, live = true, wireBase, ldType, faq, terms, publishedTime }) {
  const ranked = [...ed.items].sort((a, b) => b.score - a.score);
  const ok = (ed.health ?? []).filter((h) => h.ok).length;
  const isHome = path === '/';
  const nav = ROUTES.map((r) => `<a href="${r.path}" data-tab="${r.tab}"${r.id === route ? ' aria-current="page"' : ''}>${r.nav}</a>`).join('');
  const vars = {
    HEAD_META: headMeta({ title, desc, path, type: article ? 'article' : 'website', publishedTime }),
    CSS_HREF: ASSETS.css,
    JS_SRC: ASSETS.js,
    JSONLD: jsonLd({ title, desc, path, crumbs, list, modified: ed.compiled, article, type: ldType, faq, terms }),
    NAV: nav,
    WORDMARK: isHome
      ? '<h1 class="wordmark"><img class="brand-mark" src="/icon.svg" alt="" width="36" height="42">OUTPOST<span class="dot">.</span><span class="sr-only"> — daily cybersecurity, defence technology, geodata and geopolitics briefing</span></h1>'
      : '<div class="wordmark"><a href="/"><img class="brand-mark" src="/icon.svg" alt="" width="36" height="42">OUTPOST<span class="dot">.</span><span class="sr-only"> — home</span></a></div>',
    MASTHEAD_ART: isHome ? mastheadArt() : '',
    MAIN: main,
    AD_SIDEBAR: ad('sidebar'),
    PROMO: promoHtml(),
    FOOTER_LINKS: footerLinks,
    EDITION: ed.edition,
    LIVE: String(live),
    COMPILED: `${hhmm(ed.compiled)} UTC · ${dLong(ed.compiled)}`,
    META_TODAY: `${ok} sources · ${ed.items.length} stories · ${ed.kev.length} exploited CVEs`,
    WIRE_COUNT: Math.min(20, ranked.length),
    FOOTER_STAMP: `Compiled from open-source reporting and CISA/NVD data, ${hhmm(ed.compiled)} UTC, ${dLong(ed.compiled)}.`,
  };
  let html = template.replace(/<!--GEN:wire-->[\s\S]*?<!--\/GEN:wire-->/, () => `<!--GEN:wire-->${wireHtml(ranked.slice(0, 20), wireBase)}<!--/GEN:wire-->`);
  html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  // one <h1> per page: the section title (on the home page the wordmark is the h1)
  if (!isHome) html = html.replace(/<h2 class="sec-title">([\s\S]*?)<\/h2>/, '<h1 class="sec-title">$1</h1>');
  return html;
}

function pageFor(ed, route) {
  const ranked = [...ed.items].sort((a, b) => b.score - a.score);
  const d = dMid(ed.compiled);
  const heads = (sec, n) => ranked.filter((i) => i.section === sec).slice(0, n).map((i) => plain(i.title).replace(/[.\s]+$/, ''));
  const per = (s) => ranked.filter((i) => i.section === s).slice(0, 2);
  const front = [per('cyber')[0], per('warfare')[0], per('geo')[0], per('cyber')[1], per('warfare')[1], per('geo')[1]].filter(Boolean);
  const secList = (s, path) => ranked.filter((i) => i.section === s).map((i) => ({ title: i.title, url: `${SITE}${path}#s-${i.id}` }));
  const r = R[route];
  const sec = (section, title, sub) => sectionPage(ed, section, { title, sub, lvl: 2, route });
  const cfg = {
    'top-stories': {
      title: `Outpost: Cyber, Defence Tech & Geopolitics Briefing — ${d}`,
      desc: cut(`Today’s top stories: ${[...heads('cyber', 1), ...heads('warfare', 1), ...heads('geo', 1)].join('; ')}. Daily, source-linked briefing.`, 158),
      main: secHead({ title: 'Top Stories', sub: 'The best of cyber, warfare technology and geopolitics, two from each, ranked by recency, source weight and how many outlets carry the story.' }) + ad('top') +
        (front.length ? `<div class="entries">${entry(front[0], { n: 1, lvl: 3, lead: true })}</div>` : '') + termsPanel('home') +
        (front.length > 1 ? `<div class="entries entries-2up">${front.slice(1).map((it, i) => entry(it, { n: i + 2, lvl: 3 })).join('\n')}</div>` : '') + ad('inline'),
      list: front.map((i) => ({ title: i.title, url: `${SITE}/#s-${i.id}` })),
    },
    cyber: { title: `Cybersecurity News Today — ${d} | Outpost`, desc: cut(`Cyber threat news for ${d}: ${heads('cyber', 3).join('; ')}. Breaches, campaigns and advisories, linked to source.`, 158), main: sec('cyber', 'Cyber Threat Intelligence', 'Breaches, campaigns, advisories and research.'), list: secList('cyber', r.path) },
    vulns: { title: `Newly Exploited Vulnerabilities (CISA KEV) — ${d} | Outpost`, desc: cut(`The newest CVEs CISA lists as exploited in the wild, with CVSS scores and required actions: ${ed.kev.slice(0, 4).map((k) => k.cve).join(', ')} and more.`, 158), main: kevTable(ed.kev), list: ed.kev.map((k) => ({ title: `${k.cve}: ${k.vendor} ${k.product}`, url: k.url })) },
    warfare: { title: `Modern Warfare Technology News — ${d} | Outpost`, desc: cut(`Modern warfare technology today (${d}): ${heads('warfare', 3).join('; ')}. Drones, EW, missiles and defence systems, with sources.`, 158), main: sec('warfare', 'Modern Warfare Technology', 'Drones, electronic warfare, missiles, air defence and the systems behind the operations, from analysts, defence press and open-source investigators.'), list: secList('warfare', r.path) },
    geo: { title: `Geopolitics, Geodata & GNSS Security — ${d} | Outpost`, desc: cut(`Geopolitics and geospatial security for ${d}: ${heads('geo', 3).join('; ')}. Strategy, GNSS jamming, space and the geo wars, with sources.`, 158), main: sec('geo', 'Geopolitics &amp; Geodata', 'Strategy, geo wars, GNSS and satellite security: the contest over who sees and who controls the map.'), list: secList('geo', r.path) },
    today: { title: `Today’s Top 5 & What to Learn — ${d} | Outpost`, desc: cut(`The five stories that matter on ${d}, a defender checklist, and today’s concepts explained: ${(ed.learn ?? []).map((l) => l.term).join(', ')}.`, 158), main: todayHtml(ed, ranked), list: ranked.slice(0, 5).map((i) => ({ title: i.title, url: `${SITE}${SECTION_ROUTE[i.section].path}#s-${i.id}` })) },
    toolbox: { title: 'OSINT Toolbox: Free Tools to Verify News Yourself | Outpost', desc: 'A curated list of free open-source intelligence tools for conflict mapping, flight and ship tracking, GNSS interference, threat intelligence and image verification.', main: toolboxHtml(toolbox), list: [] },
    archive: { title: 'Archive: Past Daily Briefings | Outpost', desc: 'Every past Outpost edition — daily cybersecurity, defence technology, geodata and geopolitics briefings.', main: archiveHtml(archiveRows), list: [] },
  }[route];
  const crumbs = route === 'top-stories' ? [] : [[plain(r.nav), r.path]];
  return render({ ed, route, path: r.path, crumbs, ...cfg });
}

function editionPage(ed) {
  const ranked = [...ed.items].sort((a, b) => b.score - a.score);
  const d = dLong(ed.compiled);
  const path = `/archive/${ed.date}.html`;
  const block = (section, title, sub) => {
    const list = ed.items.filter((i) => i.section === section);
    return secHead({ title, sub }) + (list.length ? entriesHtml(list, { lvl: 3, inlineAd: false }) : '<p class="sec-sub">No qualifying items from the sources that responded.</p>');
  };
  const main = secHead({ title: `Edition ${ed.edition} — ${d}`, sub: `Cyber, warfare technology and geopolitics as compiled on ${d}.`, art: '' }) +
    block('cyber', 'Cyber', 'Breaches, campaigns, advisories and research.') +
    block('warfare', 'Warfare', 'Drones, electronic warfare, missiles and defence systems.') +
    block('geo', 'Geopolitics &amp; geodata', 'Strategy, geo wars, GNSS and satellite security.') +
    kevTable(ed.kev, { head: false });
  const top = ranked.slice(0, 3).map((i) => plain(i.title).replace(/[.\s]+$/, ''));
  return render({
    ed, route: 'archive', path, article: true, live: false, wireBase: path, publishedTime: ed.compiled,
    crumbs: [['Archive', '/archive/'], [d, path]],
    title: `Cyber, Warfare Tech & Geopolitics — ${d} | Outpost`,
    desc: cut(`Edition ${ed.edition}, ${d}: ${top.join('; ')}.`, 158),
    main, list: ranked.map((i) => ({ title: i.title, url: `${SITE}${path}#s-${i.id}` })),
  });
}

function staticPage(ed, pg) {
  let body = readFileSync(`${ROOT}src/pages/${pg.id}.html`, 'utf8');
  if (pg.id === 'about') body = body.replace('<!--FAQ-->', faqHtml()).replace('<!--CREDITS-->', creditsHtml());
  if (pg.id === 'glossary') body = glossaryHtml(`<div class="prose">${body}</div>`);
  else body = `<div class="prose">${body}</div>`;
  const art = ['about', 'glossary'].includes(pg.id) ? bannerFor(pg.id) : '';
  const title = pg.seoTitle ?? (/outpost/i.test(pg.title) ? pg.title : `${pg.title} | Outpost`);
  return render({
    ed, route: pg.id, path: pg.path, crumbs: [[pg.title, pg.path]], title, desc: pg.desc,
    main: secHead({ title: esc(pg.title), art }) + body,
    ldType: pg.id === 'about' ? 'AboutPage' : 'WebPage',
    faq: pg.id === 'about' ? FAQ : null,
    terms: pg.id === 'glossary' ? glossary.terms : null,
  });
}

// ---------- write ----------
const out = ROOT + 'dist/';
rmSync(out, { recursive: true, force: true });
mkdirSync(out + 'archive', { recursive: true });
cpSync(ROOT + 'public', out, { recursive: true });
mkdirSync(out + 'assets', { recursive: true });
for (const [name, body] of Object.entries(assetFiles)) writeFileSync(out + 'assets/' + name, body);
const put = (path, html) => {
  const file = path.endsWith('/') ? out + path.slice(1) + 'index.html' : out + path.slice(1);
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  writeFileSync(file, html);
};
const latest = editions[0];
for (const r of ROUTES) put(r.path, pageFor(latest, r.id));
for (const p of PAGES) put(p.path, staticPage(latest, p));
for (const e of editions) put(`/archive/${e.date}.html`, editionPage(e));

// Pre-redesign archive pages were copied in from the old site; they canonicalised to the home page.
// Point each at its own URL so it can be indexed on its own.
for (const f of existsSync(ROOT + 'public/archive') ? readdirSync(ROOT + 'public/archive') : []) {
  if (!/^\d{4}-\d{2}-\d{2}\.html$/.test(f) || editions.some((e) => f === `${e.date}.html`)) continue;
  const own = `${SITE}/archive/${f}`;
  const file = out + 'archive/' + f;
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${own}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${own}">`));
}

// RSS: latest three editions, links point at our own per-story anchors
const rssItems = [];
const seen = new Set();
for (const e of editions.slice(0, 3)) for (const i of [...e.items].sort((a, b) => b.score - a.score)) {
  if (seen.has(i.id)) continue;
  seen.add(i.id);
  const body = [
    `<p>${esc(i.summary)}</p>`,
    i.why ? `<p><strong>${WHY_LABEL[i.section]}:</strong> ${esc(i.why)}</p>` : '',
    `<p>Source: <a href="${href(i.url)}">${esc(i.source)}</a>${i.also?.length ? ` · Also: ${i.also.map((a) => `<a href="${href(a.url)}">${esc(a.source)}</a>`).join(', ')}` : ''}</p>`,
  ].filter(Boolean).join('');
  rssItems.push(`<item><title><![CDATA[${plain(i.title)}]]></title><link>${SITE}/archive/${e.date}.html#s-${i.id}</link><guid isPermaLink="false">outpost-${i.id}</guid><pubDate>${new Date(i.published).toUTCString()}</pubDate><category>${DOMAIN_LABEL[i.section]}</category><description><![CDATA[${body}]]></description></item>`);
}
writeFileSync(out + 'feed.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Outpost — cyber, defence tech and geopolitics</title><link>${SITE}/</link><atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/><description>A daily, source-linked briefing on cybersecurity, modern warfare technology, geodata and geopolitics.</description><language>en</language><lastBuildDate>${new Date(latest.compiled).toUTCString()}</lastBuildDate>\n${rssItems.join('\n')}\n</channel></rss>\n`);

// sitemap: routes + pages + every edition (incl. legacy archive files shipped in public/)
const SITEMAP_PRIORITY = { '/': '1.0', '/today/': '0.9', '/cyber/': '0.9', '/cves/': '0.9', '/warfare/': '0.8', '/geopolitics/': '0.8', '/toolbox/': '0.6', '/glossary/': '0.6', '/archive/': '0.4', '/about/': '0.3', '/methodology/': '0.3', '/privacy/': '0.3' };
const priorityFor = (p) => SITEMAP_PRIORITY[p] ?? (p.startsWith('/archive/') ? '0.4' : '0.8');
const old = existsSync(ROOT + 'public/archive') ? readdirSync(ROOT + 'public/archive').map((f) => f.match(/^(\d{4}-\d{2}-\d{2})\.html$/)?.[1]).filter(Boolean) : [];
const dates = [...new Set([...editions.map((e) => e.date), ...old])].sort().reverse();
const u = (path, lastmod, freq, pri) => `  <url><loc>${SITE}${path}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
writeFileSync(out + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [...ROUTES.map((r) => u(r.path, latest.date, r.id === 'toolbox' ? 'monthly' : 'daily', priorityFor(r.path))),
   ...PAGES.map((p) => u(p.path, latest.date, p.id === 'glossary' ? 'monthly' : 'yearly', priorityFor(p.path))),
   ...dates.map((d) => u(`/archive/${d}.html`, d, 'never', '0.4'))].join('\n') + '\n</urlset>\n');
console.log(`rendered ${ROUTES.length} routes, ${PAGES.length} pages, ${editions.length} edition(s); latest ${latest.date} (Ed. ${latest.edition}); plates ${makePlate ? 'on' : 'off'}, photos ${Object.keys(images).length}`);
