// Pure render step: data/editions/*.json + src/template.html -> dist/. No network, no AI —
// this is what Vercel runs on every deploy, so a build can never fail because an API did.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = 'https://outpostdaily.com';
const json = (p, fb) => (existsSync(ROOT + p) ? JSON.parse(readFileSync(ROOT + p, 'utf8')) : fb);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const href = (u) => (/^https?:\/\//.test(u) ? esc(u) : '#');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const dShort = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dLong = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const hhmm = (iso) => new Date(iso).toISOString().slice(11, 16);
const SEC = { cyber: ['02', 'Cyber', '#cyber'], warfare: ['04', 'Warfare', '#warfare'], world: ['05', 'World', '#world'] };

const head = (num, title, sub) =>
  `<div class="sec-head"><span class="sec-num">${num}</span><div><h2 class="sec-title">${title}</h2><p class="sec-sub">${sub}</p></div></div>`;
const tags = (it) => (it.tags?.length ? `<div class="tags">${it.tags.map((t) => `<button type="button" class="tag" data-kw="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '');
const sources = (it) =>
  `<div class="src">Source${it.also?.length ? 's' : ''}: <a href="${href(it.url)}" target="_blank" rel="noopener">${esc(it.source)}, ${dShort(it.published)}</a>` +
  (it.also ?? []).map((a) => ` · <a href="${href(a.url)}" target="_blank" rel="noopener">${esc(a.source)}</a>`).join('') +
  (it.also?.length ? ` <span class="sec-sub">(${it.also.length + 1} outlets)</span>` : '') + '</div>';
const why = (it, label) => (it.why ? `<p><b>${label}:</b> ${esc(it.why)}</p>` : '');

const story = (it) => `<article class="story kw-unit">
  <div class="story-head">${esc(it.title)}</div>
  <div class="story-meta">${esc(it.source)} · ${SEC[it.section][1]} · ${dLong(it.published)}</div>
  <p>${esc(it.summary)}</p>
  ${it.why ? `<div class="impact"><b>Why it matters:</b> ${esc(it.why)}</div>` : ''}
  ${tags(it)}${sources(it)}
</article>`;
const item = (it, label) => `<div class="item kw-unit"><h4>${esc(it.title)}</h4><p>${esc(it.summary)}</p>${why(it, label)}${tags(it)}${sources(it)}</div>`;

function sectionHtml(ed, id, num, title, sub, label) {
  const list = ed.items.filter((i) => i.section === id);
  return head(num, title, sub) + (list.length ? list.map((i) => item(i, label)).join('\n') : '<p class="sec-sub">No qualifying items in the last 36 hours from the sources that responded.</p>');
}

const cvssChip = (s) => (s == null ? '<span class="chip no">—</span>' : `<span class="chip ${s >= 9 ? 'crit' : s >= 7 ? 'high' : 'med'}">${s.toFixed(1)}</span>`);
const kevTable = (kev) => head('03', 'Vulnerabilities &amp; Exploitation', 'Newest additions to CISA’s Known Exploited Vulnerabilities catalog — every row is exploited in the wild') +
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
    `<div class="gaps"><b>Method &amp; gaps — nothing padded to fill space</b>Every headline, link and date comes straight from the source feeds; ${aiCount} of ${ed.items.length} summaries were written by ${esc(ed.model)} from the headline and snippet only, with any number it could not find in the source thrown away. Treat summaries as pointers and read the linked source.` +
    (down.length ? ` Feeds that did not respond today: ${down.map((d) => esc(d.name)).join(', ')}.` : ' All feeds responded.') + '</div>';
}

function toolboxHtml(tb) {
  return head('07', 'OSINT Toolbox', 'Open-source tools for checking the news yourself — verify, don’t just read') +
    tb.groups.map((g) => `<h3 class="sec-sub" style="margin:22px 0 6px">${esc(g.title)}</h3>` + g.links.map((l) => `<div class="item kw-unit"><h4><a href="${href(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a></h4><p>${esc(l.desc)}</p></div>`).join('')).join('');
}

function archiveHtml(rows) {
  return head('—', 'Archive', 'Real editions only — nothing here is backfilled or invented') +
    `<div class="archive-list">${rows.map((r) => `<div class="archive-row"><span class="archive-date">${dLong(r.date)} · Ed. ${r.edition}</span><span>${esc(r.text)}${r.href ? ` — <a href="${esc(r.href)}">that edition ↑</a>` : ''}</span></div>`).join('')}</div><p class="archive-note">This list grows by one row each day the briefing publishes.</p>`;
}

function wireHtml(top) {
  return top.map((i, n) => `<div class="wire-item kw-unit"><span class="wire-rank">${String(n + 1).padStart(2, '0')}</span><div class="wire-body"><span class="wire-title"><a href="${href(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a> <span class="wire-domain">(${esc(host(i.url))})</span></span><div class="wire-meta">§${SEC[i.section][0]} · ${SEC[i.section][1]} → <a href="${SEC[i.section][2]}">full story</a></div></div></div>`).join('\n');
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

function page(ed) {
  const ranked = [...ed.items].sort((a, b) => b.score - a.score);
  // front page: the two best of each domain, interleaved so no single domain owns it
  const per = (s) => ranked.filter((i) => i.section === s).slice(0, 2);
  const front = [per('cyber')[0], per('warfare')[0], per('world')[0], per('cyber')[1], per('warfare')[1], per('world')[1]].filter(Boolean);
  const gen = {
    'top-stories': head('01', 'Top Stories', 'The best of cyber, warfare and world — two from each, ranked by recency, source weight and how many outlets carry it') + front.map(story).join('\n'),
    cyber: sectionHtml(ed, 'cyber', '02', 'Cyber Threat Intelligence', 'Breaches, campaigns, advisories and research', 'What to check'),
    vulns: kevTable(ed.kev),
    warfare: sectionHtml(ed, 'warfare', '04', 'Modern Warfare', 'Operations, systems and analysis — from analysts, defense press and open-source investigators', 'Why it matters'),
    world: sectionHtml(ed, 'world', '05', 'World', 'The general news that moves the security picture', 'Why it matters'),
    today: todayHtml(ed, ranked),
    toolbox: toolboxHtml(toolbox),
    archive: archiveHtml(archiveRows),
    wire: wireHtml(ranked.slice(0, 20)),
  };
  const ok = (ed.health ?? []).filter((h) => h.ok).length;
  const vars = {
    EDITION: ed.edition,
    COMPILED: `${hhmm(ed.compiled)} UTC · ${dLong(ed.compiled)}`,
    META_TODAY: `${ok} sources · ${ed.items.length} stories · ${ed.kev.length} tracked CVEs`,
    WIRE_COUNT: Math.min(20, ranked.length),
    FOOTER_STAMP: `Compiled from open-source reporting and CISA/NVD data, ${hhmm(ed.compiled)} UTC, ${dLong(ed.compiled)}.`,
  };
  let html = template.replace(/<!--GEN:([\w-]+)-->[\s\S]*?<!--\/GEN:\1-->/g, (_, k) => `<!--GEN:${k}-->${gen[k] ?? ''}<!--/GEN:${k}-->`);
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

const out = ROOT + 'dist/';
rmSync(out, { recursive: true, force: true });
mkdirSync(out + 'archive', { recursive: true });
cpSync(ROOT + 'public', out, { recursive: true });
writeFileSync(out + 'index.html', page(editions[0]));
for (const e of editions) writeFileSync(`${out}archive/${e.date}.html`, page(e));

const old = existsSync(ROOT + 'public/sitemap.xml') ? [...readFileSync(ROOT + 'public/sitemap.xml', 'utf8').matchAll(/archive\/(\d{4}-\d{2}-\d{2})\.html/g)].map((m) => m[1]) : [];
const dates = [...new Set([...editions.map((e) => e.date), ...old])].sort().reverse();
writeFileSync(out + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE}/</loc><lastmod>${editions[0].date}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n` +
  dates.map((d) => `  <url><loc>${SITE}/archive/${d}.html</loc><lastmod>${d}</lastmod><changefreq>never</changefreq><priority>0.3</priority></url>`).join('\n') + '\n</urlset>\n');
console.log(`rendered ${editions.length} edition(s); latest ${editions[0].date} (Ed. ${editions[0].edition})`);
