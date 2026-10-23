// Read-only launch readiness report: `node src/launch.mjs [baseUrl]`. No secrets, no writes.
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('../config/site.json', import.meta.url), 'utf8'));
const base = (process.argv[2] || cfg.url).replace(/\/$/, '');
const rows = [];
const add = (ok, name, note = '') => rows.push([ok, name, note]);
const get = async (p, opts = {}) => {
  try { return await fetch(base + p, { signal: AbortSignal.timeout(15000), ...opts }); } catch { return null; }
};

const robots = await get('/robots.txt');
const rtxt = robots?.ok ? await robots.text() : '';
add(robots?.status === 200, 'robots.txt', `status ${robots?.status ?? 'error'}`);
add(/sitemap:\s*\S+/i.test(rtxt), 'robots.txt lists sitemap');
const sm = await get('/sitemap.xml');
const smt = sm?.ok ? await sm.text() : '';
add(sm?.status === 200, 'sitemap.xml', `status ${sm?.status ?? 'error'}, ${(smt.match(/<loc>/g) || []).length} urls`);
const ads = await get('/ads.txt');
const adt = ads?.ok ? await ads.text() : '';
add(ads?.status === 200 && adt.includes(cfg.adsense.client.replace('ca-', '')), 'ads.txt has publisher id', `status ${ads?.status ?? 'error'}`);

const home = await get('/');
const html = home?.ok ? await home.text() : '';
const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
add(!!canon && canon.startsWith(cfg.url), 'canonical host', canon || 'none');
const noindex = /<meta name="robots" content="[^"]*noindex/i.test(html);
add(!noindex, 'home page is indexable');

const slots = cfg.adsense.slots || {};
const empty = Object.keys(slots).filter((k) => !slots[k]);
add(empty.length === 0, 'ad slots configured (config/site.json)', empty.length ? `blank: ${empty.join(', ')}` : 'all set');
const v = cfg.verification || {};
add(!!(v.google || v.bing), 'verification tags configured (config/site.json)', v.google || v.bing ? 'set' : 'empty (DNS TXT is fine instead)');
add(/google-site-verification/.test(html) || !v.google, 'google tag present in live head', v.google ? 'checked' : 'n/a');

const pv = await get('/privacy/');
const pt = pv?.ok ? await pv.text() : '';
add(/adsense/i.test(pt), 'privacy page mentions AdSense', `status ${pv?.status ?? 'error'}`);

const feed = await get('/feed.xml');
const ft = feed?.ok ? await feed.text() : '';
const items = (ft.match(/<item[\s>]/g) || []).length || (ft.match(/<entry[\s>]/g) || []).length;
add(items > 0, 'feed.xml items', `${items}`);

const need = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security'];
const missing = need.filter((h) => !home?.headers.get(h));
add(home && !missing.length, 'security headers', missing.length ? `missing: ${missing.join(', ')}` : 'all present');

const og = await get('/og.jpg');
add(og?.status === 200, 'og image', `status ${og?.status ?? 'error'}`);

const w = Math.max(...rows.map((r) => r[1].length));
console.log(`Launch readiness for ${base}\n`);
for (const [ok, n, note] of rows) console.log(`${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(w)}  ${note}`);
const fails = rows.filter((r) => !r[0]).length;
console.log(`\n${rows.length - fails}/${rows.length} passed`);
process.exit(fails ? 1 : 0);
