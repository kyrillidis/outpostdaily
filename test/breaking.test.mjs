// The Breaking desk: the view that builds the page body and the live API that serves the same markup. No network:
// the API test stubs global fetch. Raw fixture items go through the real normalizeBreaking(), as in the build.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeBreaking } from '../src/lib/feed.mjs';
import { renderBreakingBody } from '../src/lib/breaking-view.mjs';
import handler from '../api/breaking.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NOW = Date.now();
const ago = (min) => new Date(NOW - min * 60e3).toISOString();
const CFG = { crisisRelevant: '\\b(missiles?|strikes?|ceasefire|troops|drones?)\\b' };
const PANELS = ['crisis', 'cyber', 'darkweb', 'redteam', 'blueteam', 'markets'];

let n = 0;
const raw = (o) => ({ id: `t${++n}`, kind: 'x', severity: 'normal', verified: false, url: `https://x.com/u/status/${n}`, ...o });
// ~12 raw items covering every group and kind, including hostile text
const FIXTURE = [
  raw({ group: 'crisis', source: '@warwatch', title: 'Missile strike hits port city, officials say several people were killed and dozens injured. Rescue teams are still searching the rubble and the port authority has closed every berth until further notice.', severity: 'high', published: ago(5) }),
  raw({ group: 'crisis', kind: 'news', source: 'BBC World', title: 'Ceasefire talks resume in Geneva as troops pull back from the border', verified: true, url: 'https://www.bbc.co.uk/news/articles/abc?at_medium=RSS&amp;at_campaign=rss', published: ago(20) }),
  raw({ group: 'crisis', source: '@frontline', title: 'Explosions reported near the frontline as drones strike a fuel depot overnight', url: 'javascript:alert(1)', published: ago(30) }),
  raw({ group: 'cyber', source: '@cyberwatch', title: 'Zero-day exploited in the wild in popular VPN appliance, CISA adds it to the KEV catalogue', severity: 'high', published: ago(12) }),
  raw({ group: 'cyber', kind: 'news', source: 'The Hacker News', title: 'Zero-day exploited in the wild in popular VPN appliance, CISA adds it to KEV catalog', severity: 'high', verified: true, url: 'https://thehackernews.com/2026/10/vpn-zero-day.html', published: ago(10) }),
  raw({ group: 'cyber', source: '@evil"onmouseover="x', title: '<script>alert(1)</script> Ransomware gang claims attack on "Acme & Sons" hospital network and says it will publish files', url: 'https://x.com/evil/status/1?a=1&amp;b=2', published: ago(40) }),
  raw({ group: 'redteam', source: '@redops', title: 'New open-source tool bypasses EDR hooks using direct syscalls, vulnerability details are in the repository', published: ago(50) }),
  raw({ group: 'blueteam', kind: 'news', source: 'The DFIR Report', title: 'DFIR report: ransomware affiliate moves from phishing to domain admin in under 24 hours', verified: true, url: 'https://thedfirreport.com/2026/10/25/intrusion/', published: ago(60) }),
  raw({ group: 'darkweb', source: '@darkwatch', title: 'Threat actor allegedly selling customer database of a regional retailer, two million records claimed', published: ago(15) }),
  raw({ group: 'darkweb', kind: 'ransomware', source: 'ransomware.live', title: 'Qilin claims Example Hospital (US) — Healthcare', url: 'https://www.ransomware.live/id/abc', published: ago(25) }),
  raw({ group: 'darkweb', kind: 'forum', source: 'DarkForums', title: 'Selling 5M user database dump from a gaming platform, forumthread', url: 'https://darkforums.st/Thread-sell', published: ago(35) }),
  raw({ group: 'markets', source: '@marketwire', title: 'Oil jumps 3% as OPEC signals output cut, Brent trades above $90 a barrel', published: ago(45) }),
  raw({ group: 'markets', kind: 'news', source: 'MarketWatch', title: 'Fed holds rates steady but warns inflation remains elevated for now', verified: true, url: 'https://www.marketwatch.com/story/fed', published: ago(70) }),
];
const HEALTH = [{ name: 'BBC World', ok: true, n: 3 }, { name: 'X cyber', ok: true, n: 0 }, { name: 'DarkForums', ok: false, error: 'HTTP 503' }];
const DATA = { updated: ago(2), health: HEALTH, items: FIXTURE };

// the page build and the API both drop forum listings before normalising
const norm = (items) => normalizeBreaking(items.filter((i) => i.kind !== 'forum'), CFG);
const body = (items = norm(FIXTURE), extra = {}) => renderBreakingBody({ items, health: HEALTH, updated: DATA.updated, now: NOW, ...extra });

// a large input in which every item survives normalising (unique words keep the de-duplicator from merging them)
const bulk = (count) => Array.from({ length: count }, (_, i) => {
  const group = PANELS[i % 6], words = Array.from({ length: 22 }, (_, k) => `zq${(i * 31 + k).toString(36)}vx`).join(' ');
  const trigger = group === 'crisis' ? 'missile strike' : group === 'markets' ? 'oil' : 'ransomware';
  return { id: `b${i}`, kind: 'x', group, source: `@src${i % 7}`, title: `${trigger} ${words}`, url: `https://x.com/src/status/${i}`, published: ago(i), severity: i % 3 ? 'normal' : 'high', verified: false };
});

const idsOf = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const panelOf = (html, g) => html.match(new RegExp(`<section class="bk-panel" id="bk-${g}"[\\s\\S]*?</section>`))?.[0] ?? '';
const rowsIn = (html) => (html.match(/<li class="bk-row/g) ?? []).length;
const rowWith = (html, text) => html.match(/<li class="bk-row[\s\S]*?<\/li>/g).find((r) => r.includes(text)) ?? '';

test('the body has the status line, Top now, stream navigation and all six panels in order', () => {
  const html = body();
  assert.match(html, /<div class="bk-status" id="bk-status">/);
  assert.match(html, /<section class="bk-top" id="bk-top"[^>]*>[\s\S]*<h2 class="bk-h" id="bk-top-h">Top now<\/h2>/);
  assert.match(html, /<nav class="bk-nav"[^>]*aria-label="Breaking streams">/);
  const at = PANELS.map((g) => { assert.ok(html.includes(`id="bk-${g}"`), `panel ${g}`); assert.ok(html.includes(`href="#bk-${g}"`), `nav ${g}`); return html.indexOf(`<section class="bk-panel" id="bk-${g}"`); });
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'panels are in the agreed order');
  assert.match(html, /href="\/methodology\/"/);
  assert.ok(!/<h1[\s>]/.test(html), 'the page h1 comes from the page, not the body');
  let prev = 1;
  for (const m of html.matchAll(/<h([1-6])[\s>]/g)) { assert.ok(+m[1] <= prev + 1 && +m[1] >= 2, `heading order h${prev} -> h${m[1]}`); prev = +m[1]; }
});

test('Top now picks recent items from the news streams only, with markers and source counts', () => {
  const top = body().match(/<section class="bk-top"[\s\S]*?<\/section>/)[0];
  assert.ok(/<h3 class="bk-lead-title">/.test(top));
  assert.ok(top.includes('High signal'));
  assert.ok(/\+1 source</.test(top), 'the merged zero-day story lists its other source');
  assert.ok(!top.includes('Oil jumps') && !top.includes('allegedly selling'), 'Markets and Dark web are not in Top now');
  assert.ok((top.match(/class="bk-lead /g) ?? []).length <= 6);
});

test('hostile text is escaped and unsafe links are never made', () => {
  const html = body();
  assert.ok(!/<script/i.test(html), 'no script element');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'the title is shown as text');
  assert.ok(!html.includes('"onmouseover="'), 'attribute injection through a source name');
  assert.ok(!/href="javascript:/i.test(html) && !html.includes('javascript:alert'), 'javascript: urls are not linked');
  assert.ok(html.includes('Explosions reported near the frontline'), 'the item itself still shows');
  assert.ok(html.includes('href="https://x.com/evil/status/1?a=1&amp;b=2"'), 'an entity in a feed url is escaped once');
  assert.ok(html.includes('href="https://www.bbc.co.uk/news/articles/abc?at_medium=RSS&amp;at_campaign=rss"'));
  assert.ok(!/&amp;(amp|quot|lt|gt|#x?[0-9a-f]+);/i.test(html), 'nothing is escaped twice');
});

test('every link to another site opens safely, forum links also carry nofollow ugc', () => {
  const forum = body(normalizeBreaking(FIXTURE, CFG)); // callers drop forum items; if one arrives it is labelled and nofollowed
  for (const a of forum.match(/<a [^>]*target="_blank"[^>]*>/g)) assert.match(a, /rel="noopener( nofollow ugc)?"/);
  const links = forum.match(/<a [^>]*href="https:\/\/darkforums\.st[^>]*>/g) ?? [];
  assert.ok(links.length >= 1, 'the forum item is rendered when passed in');
  for (const a of links) assert.match(a, /rel="noopener nofollow ugc"/);
  assert.ok(forum.includes('Forum claim') && /Unverified/.test(rowWith(forum, 'Selling 5M user database')));
  const page = body();
  assert.ok(!/darkforums|Forum claim|data-kind="forum"/.test(page), 'forum listings are kept off the page when the callers drop them');
});

test('unverified items say so in text, outlet items do not', () => {
  const html = body();
  assert.match(rowWith(html, 'Missile strike hits port city'), /High signal[\s\S]*Unverified/);
  assert.ok(!rowWith(html, 'Ceasefire talks resume').includes('Unverified'));
  assert.ok(rowWith(html, 'Ceasefire talks resume').includes('>News<'));
  assert.ok(rowWith(html, 'Qilin claims Example Hospital').includes('Leak-site claim'));
  assert.ok(rowWith(html, 'Missile strike hits port city').includes('>X post<'));
});

test('rows carry a UTC clock, a relative-time element, topic chips and a Full post disclosure for long X posts', () => {
  const html = body();
  const r = rowWith(html, 'Missile strike hits port city');
  assert.match(r, /<span class="bk-clock">\d\d:\d\d UTC<\/span> <time class="bk-ago" datetime="[^"]+" data-rel>\d+ \w{3}<\/time>/);
  assert.match(r, /class="bk-chip">(Strikes|Casualties)</);
  assert.match(r, /<details class="bk-d" id="bk-rf-[^"]+"><summary>Full post<\/summary><p>Missile strike hits port city/);
  assert.ok(!rowWith(html, 'Fed holds rates steady').includes('Full post'), 'a short outlet headline has nothing more to show');
  assert.ok(!/Full post/.test(panelOf(html, 'darkweb')), 'the dark web stream shows headlines only');
});

test('panels: dark web shows five rows and the desk link, Markets is collapsed, long streams fold after five rows, empty streams are calm', () => {
  const big = norm(bulk(300));
  assert.ok(big.length >= 290, 'the big input survives normalising');
  const html = body(big);
  const dark = panelOf(html, 'darkweb');
  assert.equal(rowsIn(dark), 5);
  assert.match(dark, /<a class="bk-go" href="\/dark-web\/">Open the Dark web desk/);
  assert.match(dark, /Listing the 5 newest of 50\./);
  const war = panelOf(html, 'crisis');
  assert.equal(rowsIn(war), 14, 'capped at 14 rows');
  assert.match(war, /<\/ol><details class="bk-more" id="bk-crisis-more"><summary>Show 9 more<\/summary>/);
  assert.match(war, /Listing the 14 newest of 50\./);
  assert.match(war, /<p class="bk-srcs"><b>Sources:<\/b> @src\d \(\d+\)/);
  const mk = panelOf(html, 'markets');
  assert.match(mk, /<details class="bk-fold" id="bk-markets-fold"><summary>Show 14 market items<\/summary>/);
  assert.ok(!/<details class="bk-fold"[^>]*\sopen/.test(mk), 'closed by default');
  const quiet = body(norm(FIXTURE));
  assert.match(panelOf(quiet, 'redteam'), /0 items|1 item/);
  const none = body([]);
  for (const g of PANELS) assert.match(panelOf(none, g), /class="bk-empty">Nothing in this stream right now/);
  assert.ok(!/undefined|NaN|null/.test(none), 'no stray values in the empty desk');
  assert.doesNotThrow(() => renderBreakingBody());
  assert.doesNotThrow(() => renderBreakingBody({ items: null, health: null, updated: 'not a date' }));
});

test('ids are unique and the markup stays light', () => {
  for (const html of [body(), body(norm(bulk(300))), body([])]) {
    const ids = idsOf(html), dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dup, [], 'duplicate ids');
    assert.ok(ids.every((id) => id.startsWith('bk-')), 'ids are prefixed bk-');
  }
  const size = Buffer.byteLength(body(norm(bulk(300))));
  assert.ok(size < 110 * 1024, `300 items render ${Math.round(size / 1024)}KB (max 110KB)`);
  const file = ROOT + 'data/breaking.json';
  if (existsSync(file)) {
    const d = JSON.parse(readFileSync(file, 'utf8'));
    const real = Buffer.byteLength(renderBreakingBody({ items: norm(d.items), health: d.health, updated: d.updated, now: Date.parse(d.updated) + 6e4 }));
    assert.ok(real < 110 * 1024, `the real data renders ${Math.round(real / 1024)}KB (max 110KB)`);
  }
});

test('source status lists every source and shows failures in text', () => {
  const html = body();
  assert.match(html, /<b>2\/3<\/b> sources responding/);
  assert.match(html, /<summary>Source status \(1 failed\)<\/summary>/);
  assert.match(html, /<span class="bk-hn">DarkForums<\/span> <span class="bk-bad">Failed<\/span> HTTP 503/);
  assert.ok(html.indexOf('DarkForums') < html.indexOf('BBC World'), 'failures come first');
  const healthy = renderBreakingBody({ items: norm(FIXTURE), health: [{ name: 'A', ok: true, n: 1 }], updated: DATA.updated, now: NOW });
  assert.ok(!healthy.includes('failed)') && !healthy.includes('Failed'));
  assert.match(healthy, /<time datetime="[^"]+" data-rel>\d+ \w{3}<\/time>/, 'the last change carries a relative-time element');
});

// ---------- live API ----------
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; });
const res = () => { const r = { headers: {}, code: 0, body: null, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const stub = (files) => { globalThis.fetch = async (url) => { const f = files[String(url).replace(/^.*\/main\//, '')]; return f ? { ok: true, status: 200, json: async () => f } : { ok: false, status: 404, json: async () => ({}) }; }; };

test('the API returns {updated, html} with the edge cache header and no forum items', async () => {
  stub({ 'data/breaking.json': DATA, 'config/breaking.json': CFG });
  const r = res();
  await handler({}, r);
  assert.equal(r.code, 200);
  assert.equal(r.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=600');
  assert.deepEqual(Object.keys(r.body).sort(), ['html', 'updated']);
  assert.equal(r.body.updated, DATA.updated);
  for (const g of PANELS) assert.ok(r.body.html.includes(`id="bk-${g}"`));
  assert.ok(r.body.html.includes('Missile strike hits port city'));
  assert.ok(!/darkforums|Forum claim|Selling 5M/.test(r.body.html), 'forum items stay off the live desk');
  assert.ok(!/<script/i.test(r.body.html));
  assert.match(r.body.html, /<summary>Source status \(1 failed\)/);
});

test('the API answers 502 with no-store when the data cannot be read', async () => {
  stub({});
  const r = res();
  await handler({}, r);
  assert.equal(r.code, 502);
  assert.equal(r.headers['cache-control'], 'no-store');
  globalThis.fetch = async () => { throw new Error('offline'); };
  const r2 = res();
  await handler({}, r2);
  assert.equal(r2.code, 502);
  assert.equal(r2.headers['cache-control'], 'no-store');
});
