// Tells Bing, Yandex and other IndexNow engines which URLs changed. Best-effort: never fails the run.
import { readFileSync } from 'node:fs';
const site = JSON.parse(readFileSync(new URL('../config/site.json', import.meta.url), 'utf8'));
const urls = [...readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  .filter((u) => !/\/archive\/\d{4}-\d{2}-\d{2}\.html$/.test(u) || u.endsWith(`${new Date().toISOString().slice(0, 10)}.html`));
try {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(site.url).host, key: site.indexnowKey, keyLocation: `${site.url}/${site.indexnowKey}.txt`, urlList: [...urls, `${site.url}/feed.xml`] }),
    signal: AbortSignal.timeout(20000),
  });
  console.log('indexnow', res.status, urls.length + 1, 'urls');
} catch (e) { console.warn('indexnow skipped:', e.message); }
