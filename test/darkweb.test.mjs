// The Dark web page body (src/lib/darkweb-view.mjs): structure, honesty labels, escaping and empty states. Pure, no network, no build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderDarkwebBody } from '../src/lib/darkweb-view.mjs';
import { CATEGORIES } from '../src/lib/feed.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OLD_SOURCE = new RegExp('ransomware' + '\\.live', 'i'); // the previous listings source must not appear anywhere
const NOW = Date.parse('2026-10-25T21:00:00Z');
const H = 36e5, D = 864e5;
const iso = (agoMs) => new Date(NOW - agoMs).toISOString();

const claim = (over = {}) => ({
  id: 'x1', kind: 'x', source: '@DailyDarkWeb', url: 'https://x.com/DailyDarkWeb/status/1', published: iso(2 * H),
  headline: 'Qilin claims Acme Dental on its leak site', claim: 'The title alleges that Qilin listed Acme Dental, a US dental clinic, on its leak site.',
  context: 'As general background, clinics hold sensitive patient data. This is not a finding about this incident.',
  advice: ['Review access logs.', 'Enforce multifactor authentication.'], verified: false, ...over,
});
const CLAIMS = [
  claim(),
  claim({ id: 'x2', source: '@FalconFeedsio', url: 'https://x.com/FalconFeedsio/status/2', published: iso(3 * H), headline: 'Actor claims to sell 4.5TB of data from an Israeli defense body', claim: 'The title alleges a seller offers about 4.5TB of data from Israeli defense bodies.' }),
  claim({ id: 'f1', kind: 'forum', source: 'Example Forum', url: 'https://forum.example/thread/9', published: iso(5 * H), headline: 'Actor advertises a vulnerability for sale', claim: 'A post offers an unpatched flaw (CVE-2026-0001) for sale.' }),
  claim({ id: 'r1', kind: 'ransomware', source: 'RansomLook', url: 'https://www.ransomlook.io/group/falcon', published: iso(6 * H), headline: 'Falcon claims Astrana Health', claim: 'Falcon claims Astrana Health was affected.' }),
  claim({ id: 'o1', source: '@DailyDarkWeb', url: 'https://x.com/DailyDarkWeb/status/5', published: iso(7 * H), headline: 'Post shares a music reference', claim: 'The title shares a reference.', context: '', advice: [] }),
];
const LISTINGS = {
  updated: iso(H),
  items: [
    { id: 'a', group: 'Qilin', victim: 'White & Case', country: '', published: iso(2 * H), url: 'https://www.ransomlook.io/group/qilin' },
    { id: 'b', group: 'Whitearmor', victim: 'Partido Liberal', country: '', published: iso(3 * H), url: 'https://www.ransomlook.io/group/whitearmor' },
    { id: 'c', group: 'WhiteArmor', victim: 'Another Victim', country: '', published: iso(4 * H), url: 'https://www.ransomlook.io/group/whitearmor' },
    { id: 'd', group: 'Brain cipher', victim: 'Hossner-Textil GmbH', country: '', published: iso(30 * H), url: 'https://www.ransomlook.io/group/braincipher' },
    { id: 'e', group: 'Qilin', victim: 'Too Old To Count', country: '', published: iso(9 * D), url: 'https://www.ransomlook.io/group/qilin' },
  ],
};
const BREACHES = {
  updated: iso(2 * H),
  items: [
    { name: 'Chess.com (2026)', slug: 'Chess2026', domain: 'chess.com', breachDate: '2026-08-03', addedDate: iso(40 * D), count: 4653212, classes: ['Email addresses', 'Usernames'], verified: true, description: 'In August 2026, millions of records were posted online.', url: 'https://haveibeenpwned.com/Breach/Chess2026' },
    { name: 'Unverified Co', slug: 'UnverifiedCo', domain: 'unverified.example', breachDate: '2026-09-01', addedDate: iso(10 * D), count: 1200, classes: ['Names'], verified: false, description: 'A smaller list.', url: 'https://haveibeenpwned.com/Breach/UnverifiedCo' },
    { name: 'Ancient Inc', slug: 'AncientInc', domain: 'ancient.example', breachDate: '2020-01-01', addedDate: iso(80 * D), count: 5, classes: [], verified: true, description: 'Old.', url: 'https://haveibeenpwned.com/Breach/AncientInc' },
  ],
};
const render = (over = {}) => renderDarkwebBody({ claims: CLAIMS, ransomware: LISTINGS, breaches: BREACHES, now: NOW, ...over });
const visible = (html) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const cards = (html) => html.match(/<article class="dk-card[^>]*>/g) ?? [];
const ids = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

test('renders real-shaped fixtures into the four sections', () => {
  const html = render();
  assert.equal(typeof html, 'string');
  for (const id of ['dk-claims', 'dk-tracker', 'dk-breaches', 'dk-method']) assert.ok(html.includes(`id="${id}"`), `missing section ${id}`);
  assert.doesNotMatch(html, /dk-note/); // the long note is gone; every card carries its own 'Unverified claim' label instead
  assert.match(html, /href="\/methodology\/"/);
  assert.match(html, /Latest 4 listings|Latest \d+ listings/);
});

test('renders with empty, missing and malformed inputs without throwing', () => {
  const cases = [undefined, {}, { claims: [], ransomware: { items: [] }, breaches: { items: [] } }, { claims: null, ransomware: null, breaches: null },
    { claims: [null, 5, 'x', {}], ransomware: { items: [null, {}, { published: 'nonsense' }] }, breaches: { items: [null, {}, { name: 5, classes: 'no', count: 'many' }] }, now: 'soon' }];
  for (const c of cases) {
    const html = renderDarkwebBody(c);
    assert.equal(typeof html, 'string');
    for (const id of ['dk-claims', 'dk-tracker', 'dk-breaches']) assert.ok(html.includes(`id="${id}"`));
  }
  const empty = renderDarkwebBody({});
  assert.match(empty, /No claim write-ups are available/);
  assert.match(empty, /No leak-site listings are in the data/);
  assert.match(empty, /No new breaches were added/);
  assert.doesNotMatch(empty, /class="dk-filters"/);
});

test('credits Have I Been Pwned (CC BY 4.0) and RansomLook with links, and says listings are claims', () => {
  const html = render();
  assert.match(html, /<a href="https:\/\/haveibeenpwned\.com\/" target="_blank" rel="noopener">Have I Been Pwned<\/a>/);
  assert.match(html, /<a href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"[^>]*>CC BY 4\.0<\/a>/);
  assert.match(html, /<a href="https:\/\/www\.ransomlook\.io\/" target="_blank" rel="noopener">RansomLook \(ransomlook\.io\)<\/a>/);
  assert.match(visible(html), /Listings: RansomLook \(ransomlook\.io\), licensed CC BY 4\.0/);
  assert.match(visible(html), /claim by the group on its own leak site, not a confirmed incident/);
  // the credits stay even when a section has no data
  assert.match(renderDarkwebBody({}), /haveibeenpwned\.com\//);
  assert.match(renderDarkwebBody({}), /ransomlook\.io\//);
});

test('never embeds images and never names the other sites', () => {
  const html = render();
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /darkwebinformer/i);
  assert.doesNotMatch(html, OLD_SOURCE);
  assert.doesNotMatch(html, /background-image|url\(/i);
});

test('a source handle on the block list is not printed, but the original post link still works', () => {
  const blocked = 'DarkWeb' + 'Informer';
  const html = render({ claims: [claim({ source: `@${blocked}`, url: `https://x.com/${blocked}/status/77`, headline: 'Actor claims Foo Corp was breached' })] });
  assert.doesNotMatch(visible(html), new RegExp(blocked, 'i'));
  assert.match(html, new RegExp(`href="https://x\\.com/${blocked}/status/77"`));
  assert.match(visible(html), /X post/);
});

test('escapes hostile strings everywhere', () => {
  const evil = '<script>alert(1)</script>"><img src=x onerror=alert(1)>\'&#x110000;';
  const html = renderDarkwebBody({
    now: NOW,
    claims: [claim({ headline: evil, claim: evil, context: evil, advice: [evil], source: evil, url: 'javascript:alert(1)', kind: 'forum' }), claim({ id: 'q', url: 'https://x.com/a"onmouseover="alert(1)', headline: 'Second' })],
    ransomware: { updated: evil, items: [{ id: 'z', group: evil, victim: evil, country: evil, published: iso(H), url: 'https://www.ransomlook.io/group/"><script>' }] },
    breaches: { updated: evil, items: [{ name: evil, slug: evil, domain: evil, breachDate: evil, addedDate: iso(H), count: evil, classes: [evil], verified: true, description: evil, url: 'data:text/html,<script>alert(1)</script>' }] },
  });
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<[^>]*\son(error|mouseover)=/i); // as text (escaped) it is inert; inside a tag it would run
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  for (const m of html.matchAll(/\shref="([^"]*)"/g)) assert.match(m[1], /^(https?:\/\/[^\s"<>]+|\/methodology\/|#dk-[\w-]+)$/, `unsafe href ${m[1]}`);
  assert.match(html, /Original link unavailable/);
});

test('every claim card is a search unit with a valid category and an unverified label', () => {
  const html = render();
  const c = cards(html);
  assert.equal(c.length, CLAIMS.length);
  for (const tag of c) {
    assert.match(tag, /class="dk-card kw-unit"/);
    const cat = tag.match(/data-cat="([^"]+)"/)?.[1];
    assert.ok(cat && cat in CATEGORIES, `bad data-cat in ${tag}`);
  }
  assert.equal((html.match(/Unverified claim/g) ?? []).length, CLAIMS.length);
  assert.match(html, /data-cat="ransomware"/);
  assert.match(html, /data-cat="sale"/);
});

test('claim facts come from the classifier, with an actor only when it is a named group', () => {
  const html = render();
  assert.match(html, /Actor: Qilin/);
  assert.match(html, /<dt>Size claimed<\/dt><dd>4\.5TB<\/dd>/);
  assert.match(html, /<dt>Country<\/dt><dd><b class="dk-cc">IL<\/b>Israel<\/dd>/);
  assert.doesNotMatch(render({ claims: [claim({ headline: 'SECRA says attackers exported data', claim: 'SECRA reported an export.' })] }), /Actor:/);
});

test('forum links carry nofollow ugc, other links only noopener', () => {
  const html = render();
  assert.match(html, /href="https:\/\/forum\.example\/thread\/9" target="_blank" rel="noopener nofollow ugc"/);
  assert.match(html, /href="https:\/\/x\.com\/DailyDarkWeb\/status\/1" target="_blank" rel="noopener"/);
  for (const m of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) assert.match(m[0], /rel="noopener( nofollow ugc)?"/);
  assert.equal((html.match(/nofollow ugc/g) ?? []).length, 1);
});

test('ids are unique, prefixed and every sprite reference resolves', () => {
  const html = render();
  const all = ids(html);
  assert.equal(new Set(all).size, all.length, 'duplicate ids');
  for (const i of all) assert.match(i, /^dk(-|$)/, `unprefixed id ${i}`);
  const symbols = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 10);
  assert.deepEqual(used.filter((u) => !symbols.has(u)), []);
  for (const r of [renderDarkwebBody({}), renderDarkwebBody({ claims: CLAIMS })]) {
    const s = new Set([...r.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...r.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]).filter((u) => !s.has(u)), []);
  }
});

test('headings go h2 then h3 with no skipped level and no h1', () => {
  for (const html of [render(), renderDarkwebBody({})]) {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
    assert.equal(levels[0], 2);
    assert.ok(!levels.includes(1));
    levels.reduce((prev, l) => { assert.ok(l <= prev + 1, `h${prev} followed by h${l}`); return l; }, 2);
  }
  const html = render();
  assert.equal([...html.matchAll(/<h2[\s>]/g)].length, 4);
  assert.ok([...html.matchAll(/<h3[\s>]/g)].length >= CLAIMS.length);
});

test('figures are computed from the data inside the 7 and 45 day windows, and group spellings merge', () => {
  const html = render();
  const dd = [...html.matchAll(/<dd>(\d+)<\/dd>/g)].map((m) => +m[1]);
  assert.deepEqual(dd, [CLAIMS.length, 4, 3, 2]); // 4 listings in 7 days; Qilin, WhiteArmor, Brain cipher; 2 breaches in 45 days
  const board = html.match(/<ol class="dk-bars">[\s\S]*?<\/ol>/)[0];
  assert.equal((board.match(/<li>/g) ?? []).length, 3);
  assert.match(board, /WhiteArmor<\/span><span class="dk-bv">2</);
  assert.doesNotMatch(board, /Whitearmor/);
  assert.match(board, /Qilin<\/span><span class="dk-bv">1</);
  assert.match(board, /--w:100%/);
});

test('the tracker shows no country column when the data carries no country', () => {
  const html = render();
  assert.doesNotMatch(html, /<th[^>]*>Country<\/th>/);
  assert.doesNotMatch(html, /Victim countries/);
  const rows = html.match(/<tr role="row" class="kw-unit">[\s\S]*?<\/tr>/g);
  assert.equal(rows.length, LISTINGS.items.length);
  for (const r of rows) assert.equal((r.match(/<t[dh]\b/g) ?? []).length, 4);
  assert.match(html, /href="https:\/\/www\.ransomlook\.io\/group\/qilin" target="_blank" rel="noopener"/);
});

test('breaches show a verified marker only when HIBP verified them, with thousands separators and chips', () => {
  const html = render();
  const by = (name) => html.match(new RegExp(`<li class="dk-breach kw-unit"><div class="dk-bh"><h3 class="dk-bname">${name}[\\s\\S]*?(?=<li class="dk-breach|</ul>)`))[0];
  assert.match(by('Chess\\.com'), /Verified breach/);
  assert.doesNotMatch(by('Unverified Co'), /Verified breach/);
  assert.match(html, /4,653,212/);
  assert.match(html, /<li>Email addresses<\/li>/);
  assert.match(html, /Details on Have I Been Pwned/);
  assert.equal((html.match(/Verified breach/g) ?? []).length, 2);
});

test('the filter bar, live region and Show more control match the data', () => {
  const many = Array.from({ length: 30 }, (_, i) => claim({ id: `m${i}`, url: `https://x.com/a/status/${i}`, published: iso((i + 1) * H), headline: `Qilin claims victim ${i}` }));
  const html = render({ claims: many });
  assert.equal(cards(html).length, 30);
  assert.match(html, /data-limit="12"/);
  assert.match(html, /class="dk-fbtn" data-filter="all" aria-pressed="true"><span class="dk-fl">All<\/span> <span class="dk-n">30<\/span>/);
  assert.match(html, /data-filter="ransomware" data-cat="ransomware" aria-pressed="false"/);
  assert.match(html, /id="dk-live" role="status" aria-live="polite">Showing all 30 claims\./);
  assert.match(html, /id="dk-more"[^>]*aria-controls="dk-grid">Show 18 more claims</);
  assert.doesNotMatch(render({ claims: many.slice(0, 12) }), /id="dk-more"/);
  assert.doesNotMatch(render({ claims: [claim()] }), /class="dk-filters"/);
});

test('times are absolute on the server and marked for the client to make relative', () => {
  const html = render();
  assert.match(html, /<time class="dk-time" datetime="2026-10-25T19:00:00\.000Z" data-rel>25 Oct, 19:00 UTC<\/time>/);
  assert.match(html, /<time datetime="2026-08-03">3 Aug 2026<\/time>/);
});

test('the real data renders within the size budget', { skip: !existsSync(ROOT + 'data/darkweb.json') }, () => {
  const j = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));
  const html = renderDarkwebBody({ claims: j('data/darkweb.json').items, ransomware: j('data/ransomware.json'), breaches: j('data/breaches.json'), now: Date.parse(j('data/ransomware.json').updated) });
  assert.ok(Buffer.byteLength(html) < 110 * 1024, `body is ${Buffer.byteLength(html)} bytes`);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(visible(html), /darkwebinformer/i);
  assert.doesNotMatch(visible(html), OLD_SOURCE);
  assert.equal(cards(html).length, j('data/darkweb.json').items.length);
  const all = ids(html);
  assert.equal(new Set(all).size, all.length);
});

// ---------- pictures attached to X posts: our own copy, blurred until clicked, credited, never hotlinked ----------
test('a claim with a stored picture shows it blurred behind a button, with a credit and a local src', () => {
  const html = renderDarkwebBody({ claims: [claim({ image: '/img/dw/x1.webp', imageW: 720, imageH: 405 })], now: NOW });
  assert.match(html, /<figure class="dk-media" data-state="blur"><img src="\/img\/dw\/x1\.webp" width="720" height="405"/);
  assert.match(html, /class="dk-reveal"/);
  assert.match(html, /Image: @DailyDarkWeb/);
  assert.doesNotMatch(html, /<img[^>]+src="https?:/);
});

test('imageMode show drops the blur and the button; imageMode off hides the picture entirely', () => {
  const c = [claim({ image: '/img/dw/x1.webp', imageW: 720, imageH: 405 })];
  const shown = renderDarkwebBody({ claims: c, now: NOW, imageMode: 'show' });
  assert.match(shown, /data-state="show"/); assert.doesNotMatch(shown, /dk-reveal/);
  const off = renderDarkwebBody({ claims: c, now: NOW, imageMode: 'off' });
  assert.doesNotMatch(off, /dk-media/); assert.match(off, /dk-tile/);
});

test('only local /img/dw/ webp paths are ever rendered as a picture', () => {
  for (const bad of ['https://pbs.twimg.com/media/a.jpg', '//evil.test/a.webp', '/img/dw/../../x.webp', 'javascript:alert(1)', '/img/news/a.webp']) {
    assert.doesNotMatch(renderDarkwebBody({ claims: [claim({ image: bad })], now: NOW }), /dk-media/, bad);
  }
});

test('a claim without a picture keeps the drawn tile', () => {
  const html = renderDarkwebBody({ claims: [claim()], now: NOW });
  assert.match(html, /dk-tile/); assert.doesNotMatch(html, /dk-media/);
});
