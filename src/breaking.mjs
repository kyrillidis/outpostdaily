// Breaking-news collector, run every 5 minutes by .github/workflows/breaking.yml.
// Reads fast sources (X via twitterapi.io, security RSS, ransomware.live, public forum listings),
// keeps a rolling 72-hour window in data/breaking.json and exits 0 whether or not anything changed.
// Forum entries are published as UNVERIFIED claims: headline + link only, never leaked data.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// local runs: read secrets from the git-ignored .env (Actions passes them as real environment variables)
if (existsSync(ROOT + '.env')) for (const l of readFileSync(ROOT + '.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }
const cfg = JSON.parse(readFileSync(ROOT + 'config/breaking.json', 'utf8'));
const FILE = ROOT + 'data/breaking.json';
const prev = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { items: [], updated: null };
const UA = 'OutpostDailyBot/1.0 (+https://www.outpostdaily.com)';
const KEEP_H = 72, MAX = 300;
const now = Date.now();
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
const critical = new RegExp(cfg.critical, 'i');
const criticalOther = new RegExp(cfg.criticalOther, 'i');
const interest = new RegExp(cfg.forumInterest, 'i');
const crisisRel = new RegExp(cfg.crisisRelevant, 'i');
const strip = (s) => String(s ?? '').replace(/https?:\/\/t\.co\/\S+/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const sevOf = (t, group = 'cyber') => (({ cyber: critical, redteam: critical, blueteam: critical, darkweb: critical }[group] ?? criticalOther).test(t) ? 'high' : 'normal');
const health = [];
const found = [];

// ---------- X through twitterapi.io: one search call per group returns only tweets newer than the last run ----------
async function pullX() {
  const key = process.env.TWITTERAPI_KEY;
  if (!key) { health.push({ name: 'X (twitterapi.io)', ok: false, error: 'TWITTERAPI_KEY not set' }); return; }
  const since = Math.floor((prev.updated ? Date.parse(prev.updated) - 10 * 60e3 : now - 6 * 3600e3) / 1000);
  let first = true;
  for (const [group, handles] of Object.entries(cfg.x)) {
    if (!first) await new Promise((r) => setTimeout(r, 5200)); // free tier: one request per 5 s
    first = false;
    const query = `(${handles.map((h) => 'from:' + h).join(' OR ')}) since_time:${since} -filter:replies -filter:retweets`;
    try {
      const res = await fetch('https://api.twitterapi.io/twitter/tweet/advanced_search?' + new URLSearchParams({ query, queryType: 'Latest' }), { headers: { 'x-api-key': key, 'user-agent': UA }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const tweets = (await res.json()).tweets ?? [];
      for (const t of tweets) {
        const text = strip(t.text);
        if (text.length < 20) continue;
        const handle = t.author?.userName ?? '';
        found.push({ id: 'x' + t.id, kind: 'x', group, source: '@' + handle, title: cut(text, 240), url: `https://x.com/${handle}/status/${t.id}`, published: new Date(t.createdAt).toISOString(), severity: sevOf(text, group), verified: false });
      }
      health.push({ name: `X ${group}`, ok: true, n: tweets.length });
    } catch (e) { health.push({ name: `X ${group}`, ok: false, error: String(e.message).slice(0, 80) }); }
  }
}

// ---------- security RSS ----------
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: false });
const txt = (v) => (v == null ? '' : typeof v === 'object' ? txt(v['#text'] ?? '') : String(v));
async function pullNews(src) {
  const res = await fetch(src.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const doc = xml.parse(await res.text());
  const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
  let n = 0;
  for (const e of (Array.isArray(raw) ? raw : [raw]).slice(0, 15)) {
    const l = e.link;
    const url = typeof l === 'string' ? l : (Array.isArray(l) ? l[0] : l)?.['@_href'] ?? txt(l);
    const when = new Date(txt(e.pubDate || e.published || e.updated));
    const title = strip(txt(e.title));
    if (!/^https?:\/\//.test(url) || !title || isNaN(when) || now - when > 6 * 3600e3 || when - now > 3600e3) continue; // only the last 6 h
    if (src.group === 'crisis' && !crisisRel.test(title)) continue; // general world feeds: only conflict and security items reach the war room
    found.push({ id: 'n' + sha(url), kind: 'news', group: src.group ?? 'cyber', source: src.name, title, url, published: when.toISOString(), severity: sevOf(title, src.group), verified: true });
    n++;
  }
  return n;
}

// ---------- ransomware.live: victims claimed by leak sites (claims, not confirmed incidents) ----------
async function pullRansomware() {
  const res = await fetch(cfg.ransomware, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let n = 0;
  for (const v of (await res.json()).slice(0, 40)) {
    const when = new Date(v.discovered);
    if (isNaN(when) || now - when > 6 * 3600e3 || !v.victim || !/^https:\/\//.test(v.url ?? '')) continue;
    const sector = v.activity && v.activity !== 'Not Found' ? ` — ${v.activity}` : '';
    found.push({ id: 'r' + sha(v.url), kind: 'ransomware', group: 'darkweb', source: 'ransomware.live', title: cut(`${v.group} claims ${v.victim}${v.country ? ` (${v.country})` : ''}${sector}`, 200), url: v.url, published: when.toISOString(), severity: 'normal', verified: false });
    n++;
  }
  return n;
}

// ---------- forums: public, no-login thread listings; headline + link only ----------
async function pullForum(f) {
  const res = await fetch(f.url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  if (/just a moment|cf-chl|attention required/i.test(html.slice(0, 5000))) throw new Error('blocked by anti-bot page');
  let n = 0;
  const seen = new Set();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']*(?:Thread-|showthread\.php\?tid=)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = strip(m[2]);
    let url;
    try { url = new URL(m[1].replace(/&amp;/g, '&'), f.url).href.replace(/#.*$/, '').replace(/[?&]action=.*$/, ''); } catch { continue; }
    if (title.length < 12 || seen.has(url) || !interest.test(title)) continue;
    seen.add(url);
    found.push({ id: 'f' + sha(url), kind: 'forum', group: 'darkweb', source: f.name, title: cut(title, 200), url, published: new Date(now).toISOString(), severity: sevOf(title, 'darkweb'), verified: false });
    if (++n >= 15) break;
  }
  return n;
}

const run = async (name, fn) => { try { health.push({ name, ok: true, n: await fn() }); } catch (e) { health.push({ name, ok: false, error: String(e.message).slice(0, 80) }); } };
await Promise.all([
  pullX(),
  ...cfg.news.map((s) => run(s.name, () => pullNews(s))),
  run('ransomware.live', pullRansomware),
  ...cfg.forums.map((f) => run(f.name, () => pullForum(f))),
]);

// ---------- merge, dedupe, trim ----------
const byId = new Map(prev.items.map((i) => [i.id, i]));
const byTitle = new Set(prev.items.map((i) => i.title.toLowerCase().slice(0, 80)));
let added = 0;
for (const it of found.sort((a, b) => a.published.localeCompare(b.published))) {
  const tk = it.title.toLowerCase().slice(0, 80);
  if (byId.has(it.id) || byTitle.has(tk)) continue; // same item, or the same headline already carried from another source
  byId.set(it.id, it); byTitle.add(tk); added++;
}
const items = [...byId.values()].filter((i) => now - Date.parse(i.published) < KEEP_H * 3600e3).sort((a, b) => b.published.localeCompare(a.published)).slice(0, MAX);
// the file (and therefore git) only changes when something was added or aged out
if (added > 0 || items.length !== prev.items.length || !prev.updated) writeFileSync(FILE, JSON.stringify({ updated: new Date(now).toISOString(), health, items }, null, 1) + '\n');
console.log(`breaking: +${added} new, ${items.length} kept; sources ok ${health.filter((h) => h.ok).length}/${health.length}${health.filter((h) => !h.ok).map((h) => `\n  ! ${h.name}: ${h.error}`).join('')}`);
