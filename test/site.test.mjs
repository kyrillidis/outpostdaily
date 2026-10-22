// Invariants for the generated site: SEO, accessibility, CSP, image hygiene and size budgets.
// Runs the real build once, then inspects dist/. Checks avoid depending on exact markup so the design can evolve.
import { fileURLToPath } from 'node:url';
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const read = (p) => readFileSync(p, 'utf8');
const site = JSON.parse(read(join(ROOT, 'config/site.json')));
const csp = JSON.parse(read(join(ROOT, 'vercel.json'))).headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const editionDates = readdirSync(join(ROOT, 'data/editions')).map((f) => f.replace('.json', ''));
const legacy = new Set(existsSync(join(ROOT, 'public/archive')) ? readdirSync(join(ROOT, 'public/archive')).filter((f) => !editionDates.includes(f.replace('.html', ''))) : []);

let pages = [];
before(() => {
  execFileSync('node', ['src/render.mjs'], { cwd: ROOT, stdio: 'pipe' });
  pages = walk(DIST).filter((f) => f.endsWith('.html')).map((file) => {
    const rel = ('/' + file.slice(DIST.length)).replaceAll('\\', '/').replace(/^\/+/, '/');
    const path = rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
    return { file, rel, path, html: read(file), legacy: rel.startsWith('/archive/') && legacy.has(rel.slice('/archive/'.length)) };
  });
});

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`))?.[2] ?? tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`))?.[3];
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
const metaContent = (html, key, val) => tagsOf(html, 'meta').find((t) => attr(t, key) === val);
const ids = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const fileFor = (urlPath) => {
  const p = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  const f = join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  return existsSync(f) && statSync(f).isFile() ? f : null;
};
const collect = (checks) => { const errs = []; for (const p of pages) for (const [name, fn] of checks) { const m = fn(p); if (m) errs.push(`${p.rel}: ${name} — ${m}`); } return errs; };

test('the build produced the expected pages', () => {
  for (const r of ['/index.html', '/cyber/index.html', '/cves/index.html', '/warfare/index.html', '/geopolitics/index.html', '/today/index.html', '/toolbox/index.html', '/archive/index.html', '/about/index.html', '/methodology/index.html', '/glossary/index.html', '/privacy/index.html']) {
    assert.ok(pages.some((p) => p.rel === r), `missing ${r}`);
  }
});

test('every current page has sound SEO basics', () => {
  const titles = new Map();
  const errs = collect([
    ['doctype', (p) => (/^<!doctype html>/i.test(p.html) ? '' : 'missing <!doctype html>')],
    ['lang', (p) => (/<html[^>]*\slang="en"/.test(p.html) ? '' : 'html lang="en" missing')],
    ['one h1', (p) => { const n = (p.html.match(/<h1[\s>]/g) || []).length; return n === 1 ? '' : `${n} h1 elements`; }],
    ['title', (p) => { const t = p.html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''; if (t.length < 15 || t.length > 75) return `length ${t.length}: "${t}"`; if (titles.has(t)) return `duplicate of ${titles.get(t)}`; titles.set(t, p.rel); return ''; }],
    ['description', (p) => { const d = attr(metaContent(p.html, 'name', 'description') ?? '', 'content') ?? ''; return d.length >= 50 && d.length <= 170 ? '' : `length ${d.length}`; }],
    ['canonical', (p) => { const c = attr(tagsOf(p.html, 'link').find((t) => attr(t, 'rel') === 'canonical') ?? '', 'href'); const want = site.url + p.path; return c === want ? '' : `${c} != ${want}`; }],
    ['open graph', (p) => ['og:title', 'og:description', 'og:url', 'og:image'].filter((k) => !metaContent(p.html, 'property', k)).map((k) => `no ${k}`).join(', ')],
    ['og:image resolves', (p) => { const u = attr(metaContent(p.html, 'property', 'og:image') ?? '', 'content') ?? ''; return u.startsWith(site.url + '/') && fileFor(u.slice(site.url.length)) ? '' : `unresolved ${u}`; }],
    ['robots meta allows indexing', (p) => (/noindex/i.test(attr(metaContent(p.html, 'name', 'robots') ?? '', 'content') ?? '') ? 'noindex' : '')],
    ['json-ld', (p) => { const blocks = [...p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]; if (!blocks.length) return 'none'; try { return blocks.every((b) => JSON.parse(b[1])['@graph']) ? '' : 'no @graph'; } catch (e) { return 'invalid JSON: ' + e.message; } }],
  ].map(([n, f]) => [n, (p) => (p.legacy ? '' : f(p))]));
  assert.deepEqual(errs, []);
});

test('markup is accessible and well formed', () => {
  const errs = collect([
    ['landmarks', (p) => [/<main[^>]*\sid="main"/, /<nav[^>]*\saria-label=/, /<footer/, /<header/].filter((r) => !r.test(p.html)).map(String).join(' ')],
    ['skip link target', (p) => (/href="#main"/.test(p.html) && ids(p.html).includes('main') ? '' : 'skip link or #main missing')],
    ['unique ids', (p) => { const seen = new Set(), dup = []; for (const i of ids(p.html)) { if (seen.has(i)) dup.push(i); seen.add(i); } return dup.length ? 'duplicate ids: ' + dup.slice(0, 5).join(', ') : ''; }],
    ['heading order', (p) => { let prev = 0; for (const m of p.html.matchAll(/<h([1-6])[\s>]/g)) { const l = +m[1]; if (prev && l > prev + 1) return `h${prev} followed by h${l}`; prev = l; } return ''; }],
    ['images have alt/width/height', (p) => tagsOf(p.html, 'img').filter((t) => attr(t, 'alt') === undefined || !attr(t, 'width') || !attr(t, 'height')).slice(0, 3).join(' ')],
    ['external links are noopener', (p) => tagsOf(p.html, 'a').filter((t) => attr(t, 'target') === '_blank' && !/noopener/.test(attr(t, 'rel') ?? '')).slice(0, 3).join(' ')],
    ['no empty or placeholder href', (p) => tagsOf(p.html, 'a').filter((t) => ['', '#'].includes(attr(t, 'href') ?? 'x')).slice(0, 3).join(' ')],
    ['sprite references resolve', (p) => { const have = new Set([...p.html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1])); return [...p.html.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]).filter((i) => !have.has(i)).slice(0, 3).join(', '); }],
    ['search field is labelled', (p) => (/<label[^>]*for="kwSearch"/.test(p.html) ? '' : 'no label for #kwSearch')],
  ].map(([n, f]) => [n, (p) => (p.legacy ? '' : f(p))]));
  assert.deepEqual(errs, []);
});

test('internal links, anchors and local assets resolve', () => {
  const byPath = new Map(pages.map((p) => [p.file, p]));
  const errs = [];
  for (const p of pages.filter((q) => !q.legacy)) {
    for (const t of [...tagsOf(p.html, 'a'), ...tagsOf(p.html, 'link'), ...tagsOf(p.html, 'script'), ...tagsOf(p.html, 'img')]) {
      const u = attr(t, 'href') ?? attr(t, 'src');
      if (!u || !u.startsWith('/') || u.startsWith('//') || u.startsWith('/_vercel/')) continue; // /_vercel/* is injected by the platform
      const f = fileFor(u);
      if (!f) { errs.push(`${p.rel}: ${u} does not resolve`); continue; }
      const frag = u.split('#')[1];
      if (frag && byPath.has(f) && !ids(byPath.get(f).html).includes(frag)) errs.push(`${p.rel}: ${u} fragment not found`);
    }
  }
  assert.deepEqual(errs, []);
});

test('only CSP-allowed hosts are referenced', () => {
  const scriptHosts = (csp.match(/script-src([^;]*)/)[1].match(/https:\/\/[^\s]+/g) || []).map((h) => h.replace('https://', '').replace('*.', ''));
  const styleHosts = (csp.match(/style-src([^;]*)/)[1].match(/https:\/\/[^\s]+/g) || []).map((h) => h.replace('https://', ''));
  const errs = [];
  for (const p of pages.filter((q) => !q.legacy)) {
    for (const t of tagsOf(p.html, 'script')) { const s = attr(t, 'src'); if (s && /^https?:/.test(s) && !scriptHosts.some((h) => new URL(s).hostname.endsWith(h))) errs.push(`${p.rel}: script ${s}`); }
    for (const t of tagsOf(p.html, 'link').filter((x) => attr(x, 'rel') === 'stylesheet')) { const s = attr(t, 'href'); if (/^https?:/.test(s) && !styleHosts.includes(new URL(s).hostname)) errs.push(`${p.rel}: stylesheet ${s}`); }
    for (const t of tagsOf(p.html, 'img')) { const s = attr(t, 'src'); if (/^https?:/.test(s)) errs.push(`${p.rel}: remote image ${s}`); }
    if (/url\(\s*['"]?https?:/.test(p.html)) errs.push(`${p.rel}: remote url() in inline CSS`);
  }
  assert.deepEqual(errs, []);
});

test('sitemap, feed, robots and discovery files are consistent', () => {
  const sm = read(join(DIST, 'sitemap.xml'));
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 12, 'sitemap has the routes');
  for (const l of locs) { assert.ok(l.startsWith(site.url + '/'), `${l} not on ${site.url}`); assert.ok(fileFor(l.slice(site.url.length)), `${l} has no built file`); }
  for (const r of ['/', '/cyber/', '/cves/', '/warfare/', '/geopolitics/', '/today/', '/toolbox/', '/archive/', '/about/', '/methodology/', '/glossary/', '/privacy/']) assert.ok(locs.includes(site.url + r), `sitemap lacks ${r}`);
  const feed = read(join(DIST, 'feed.xml'));
  const items = feed.match(/<item>[\s\S]*?<\/item>/g) || [];
  assert.ok(items.length > 5, 'feed has items');
  for (const it of items) for (const tag of ['title', 'link', 'guid', 'pubDate', 'description']) assert.ok(it.includes(`<${tag}`), `feed item lacks ${tag}`);
  const robots = read(join(DIST, 'robots.txt'));
  assert.ok(robots.includes(`Sitemap: ${site.url}/sitemap.xml`), 'robots.txt names the sitemap');
  assert.ok(!/^\s*Disallow:\s*\/(assets|img)?\/?\s*$/im.test(robots) && !/Disallow:.*\.(css|js)/i.test(robots), 'robots.txt must not block CSS, JS or images');
  for (const l of (read(join(DIST, 'llms.txt')).match(/\]\((https:\/\/www\.outpostdaily\.com[^)]*)\)/g) || []).map((x) => x.slice(2, -1))) assert.ok(fileFor(l.slice(site.url.length)), `llms.txt link ${l} unresolved`);
  assert.equal(read(join(DIST, `${site.indexnowKey}.txt`)).trim(), site.indexnowKey, 'IndexNow key file matches config');
  assert.ok(existsSync(join(DIST, 'ads.txt')), 'ads.txt present');
});

test('images are what their extension claims and stay small', () => {
  const magic = { '.png': (b) => b.subarray(0, 4).toString('hex') === '89504e47', '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8, '.webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' };
  const errs = [];
  for (const f of walk(join(ROOT, 'public')).filter((x) => magic[extname(x)])) if (!magic[extname(f)](readFileSync(f))) errs.push(`${f.slice(ROOT.length)} is not really a ${extname(f)} file`);
  for (const f of walk(join(DIST, 'img'))) if (statSync(f).size > 130 * 1024) errs.push(`${f.slice(DIST.length)} is ${Math.round(statSync(f).size / 1024)}KB (max 130KB)`);
  assert.ok(statSync(join(DIST, 'og.jpg')).size < 300 * 1024, 'og.jpg must stay under 300KB so chat apps show previews');
  const og = readFileSync(join(DIST, 'og.jpg')); let o = 2, dims = '';
  while (o < og.length) { if (og[o] !== 0xff) break; const m = og[o + 1]; if (m >= 0xc0 && m <= 0xc3) { dims = `${og.readUInt16BE(o + 7)}x${og.readUInt16BE(o + 5)}`; break; } o += 2 + og.readUInt16BE(o + 2); }
  assert.equal(dims, '1200x630', 'og.jpg size matches the declared og:image dimensions');
  assert.deepEqual(errs, []);
});

test('size budgets hold', () => {
  const errs = [];
  for (const p of pages.filter((q) => !q.legacy)) if (Buffer.byteLength(p.html) > 160 * 1024) errs.push(`${p.rel} HTML is ${Math.round(Buffer.byteLength(p.html) / 1024)}KB (max 160KB)`);
  for (const f of readdirSync(join(DIST, 'assets'))) { const kb = statSync(join(DIST, 'assets', f)).size / 1024; if ((f.endsWith('.css') && kb > 60) || (f.endsWith('.js') && kb > 30)) errs.push(`${f} is ${Math.round(kb)}KB`); }
  assert.deepEqual(errs, []);
});

test('ad slots render nothing until configured', () => {
  const configured = Object.values(site.adsense?.slots ?? {}).some(Boolean);
  if (configured) return;
  assert.deepEqual(pages.filter((p) => !p.legacy && /<ins class="adsbygoogle"/.test(p.html)).map((p) => p.rel), []);
});

test('today’s edition is fully present on the site', () => {
  const latest = JSON.parse(read(join(ROOT, `data/editions/${editionDates.sort().pop()}.json`)));
  const route = { cyber: '/cyber/', warfare: '/warfare/', geo: '/geopolitics/', world: '/geopolitics/' };
  const missing = latest.items.filter((i) => !read(fileFor(route[i.section])).includes(`id="s-${i.id}"`)).map((i) => i.id);
  assert.deepEqual(missing, [], 'stories missing from their section page');
  const cves = read(fileFor('/cves/'));
  assert.deepEqual(latest.kev.filter((k) => !cves.includes(k.cve)).map((k) => k.cve), [], 'KEV rows missing from /cves/');
});
