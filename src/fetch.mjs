// Collects today's edition: feeds + CISA KEV (no AI), then ONE small AI call to
// summarise only items we haven't summarised before. Writes data/editions/<date>.json.
// Every URL in the output comes from a feed; the model never produces links.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import sharp from 'sharp';
import { clusterAndScore, guardNumbers } from './rank.mjs';
import { updateDarkweb } from './darkweb.mjs';
import { updateIntel } from './intel.mjs';
import { feedEntries, checkDates, nvdVerdict, cvssCached, publishVerdict, thumbPlan } from './lib/pipeline.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p, fb) => (existsSync(ROOT + p) ? JSON.parse(readFileSync(ROOT + p, 'utf8')) : fb);
const write = (p, v) => writeFileSync(ROOT + p, JSON.stringify(v, null, 1) + '\n');

const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
// Reasoning models (gpt-5/6 family) bill hidden thinking tokens against the output cap; keep it minimal.
const EFFORT = process.env.REASONING_EFFORT ?? (/^gpt-[56]/.test(MODEL) ? 'low' : '');
const WINDOW_H = Number(process.env.WINDOW_HOURS || 36);
const LIMITS = { cyber: 10, warfare: 8, geo: 8 };
const UA = 'OutpostDailyBot/1.0 (+https://www.outpostdaily.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);

const now = new Date();
const date = now.toISOString().slice(0, 10);
mkdirSync(ROOT + 'data/editions', { recursive: true });

// ---------- feeds ----------
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: false });
const text = (v) => (v == null ? '' : typeof v === 'object' ? text(v['#text'] ?? '') : String(v));
const clean = (s) =>
  text(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();
const linkOf = (e) => {
  const l = e.link;
  if (typeof l === 'string') return l;
  const arr = Array.isArray(l) ? l : l ? [l] : [];
  const alt = arr.find((x) => x['@_rel'] === 'alternate') || arr[0];
  return alt ? alt['@_href'] || text(alt) : text(e.guid);
};

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
// Best image a feed offers for an entry: media:content / media:thumbnail / image enclosure / first <img> in the body.
function feedImage(e) {
  const cands = [
    ...arr(e['media:content']).map((m) => (!m['@_medium'] || m['@_medium'] === 'image' || /^image/.test(m['@_type'] ?? '') ? m['@_url'] : null)),
    ...arr(e['media:thumbnail']).map((m) => m['@_url']),
    ...arr(e.enclosure).map((m) => (/^image/.test(m['@_type'] ?? '') ? m['@_url'] : null)),
    ...[e['content:encoded'], e.description, e.summary, e.content].map((h) => String(text(h)).match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]),
  ];
  return cands.find((u) => typeof u === 'string' && /^https:\/\//.test(u) && !/(pixel|spacer|avatar|logo|1x1|gravatar|feedburner)/i.test(u));
}

async function pullFeed(src, section, rules) {
  const res = await fetch(src.url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, text/xml, */*' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const doc = xml.parse(await res.text());
  const list = feedEntries(doc); // throws for an HTML/captcha page or an empty feed, so health shows it
  const cutoff = now.getTime() - WINDOW_H * 3600e3;
  const out = [];
  let dated = 0;
  for (const e of list.slice(0, 25)) {
    const url = linkOf(e);
    const when = new Date(text(e.pubDate || e.published || e.updated || e['dc:date']));
    const title = clean(e.title);
    if (!isNaN(when)) dated++;
    if (!/^https?:\/\//.test(url) || !title || isNaN(when) || when.getTime() < cutoff || when > now.getTime() + 3600e3) continue;
    const snippet = clean(e.description || e.summary || e['content:encoded'] || e.content).slice(0, 320);
    if (src.filter && !rules[src.filter === 'tech' ? 'tech' : 'geo'].test(title + ' ' + snippet)) continue; // general outlets: only on-topic items
    out.push({ id: sha(url), section, source: src.name, weight: src.weight ?? 0.5, title, url, snippet, published: when.toISOString(), img: feedImage(e) });
  }
  checkDates(Math.min(list.length, 25), dated);
  return out;
}

// ---------- CISA KEV + NVD CVSS ----------
async function pullKev(cache) {
  const res = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('KEV HTTP ' + res.status);
  const j = await res.json();
  const rows = j.vulnerabilities.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)).slice(0, 12);
  let nvdCalls = 0, nvdDown = false;
  const nvdUntil = Date.now() + 120e3; // the whole NVD lookup gets two minutes, however slow NVD is
  for (const r of rows) {
    const key = 'cvss:' + r.cveID;
    if (!cvssCached(cache[key], date) && nvdCalls < 12 && !nvdDown && Date.now() < nvdUntil) {
      if (nvdCalls++) await sleep(6500); // NVD keyless limit: 5 req / 30 s
      try {
        const n = await fetch('https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=' + r.cveID, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
        if (!n.ok) { nvdDown = true; console.warn('NVD HTTP ' + n.status + ', not caching'); } // rate limit or outage: ask again next run, and stop asking now
        else {
          const v = nvdVerdict(await n.json());
          if (v) cache[key] = { score: v.score, t: date }; // a score is kept 14 days; "not scored yet" is asked again tomorrow (cvssCached)
        }
      } catch { /* leave unset, retry next run */ }
    }
    r.cvss = cache[key]?.score ?? null;
  }
  return rows.map((r) => ({
    cve: r.cveID, vendor: r.vendorProject, product: r.product, name: r.vulnerabilityName, added: r.dateAdded, due: r.dueDate,
    ransomware: r.knownRansomwareCampaignUse === 'Known', action: String(r.requiredAction || '').slice(0, 600), cvss: r.cvss,
    url: 'https://nvd.nist.gov/vuln/detail/' + r.cveID,
  }));
}

// ---------- AI (one batched call, new items only) ----------
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items', 'run_today', 'learn', 'analysis'],
  properties: {
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'summary', 'why', 'tags'],
      properties: { id: { type: 'string' }, summary: { type: 'string' }, why: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } } },
    run_today: { type: 'array', items: { type: 'string' } },
    analysis: { type: 'object', additionalProperties: false, required: ['headline', 'paragraphs', 'takeaways'],
      properties: { headline: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } }, takeaways: { type: 'array', items: { type: 'string' } } } },
    learn: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['domain', 'term', 'explainer', 'from_id'],
      properties: { domain: { type: 'string', enum: ['cyber', 'warfare', 'geo'] }, term: { type: 'string' }, explainer: { type: 'string' }, from_id: { type: 'string' } } } },
  },
};
const SYSTEM = `You edit Outpost, a daily briefing on cybersecurity, modern warfare technology, geodata/GNSS and geopolitics for people learning the field.
Use ONLY the title and snippet supplied for each item. Never add names, numbers, dates, causes or outcomes that are not in them; if the snippet is thin, write less.
Per item: summary (max 35 words, plain, neutral, attribute claims: "X says"), why (max 20 words; cyber = what a defender should check or do; warfare = the technology or operational relevance; geo = the strategic or geospatial relevance), tags (1-3 short terms from the text).
run_today: 3 short defender actions, each grounded in a cyber item above.
learn: one entry each for domains "cyber", "warfare" and "geo": term = a concept that appears in that day's items, explainer = max 45 words defining it for a beginner, from_id = the item it came from.
analysis ("Outpost analysis", ~180 words in total): synthesis across the stories in top (today's top stories): what connects them, what it means for defenders and analysts, what to watch. headline (max 12 words), paragraphs (exactly 3, max 55 words each), takeaways (exactly 3, max 20 words each). Use ONLY the titles/snippets supplied; no invented facts or numbers; no predictions stated as fact; hedge uncertainty ("may", "suggests"); neutral tone; write numbers only if they appear in top.
learn may draw on items or learn_from (titles only). Return the item ids exactly as given.`;

async function summarise(items, learnPool, top) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.warn('OPENAI_API_KEY not set — using feed snippets only'); return null; }
  const payload = (list) => list.map((i) => ({ id: i.id, sec: i.section, src: i.source, title: i.title, text: i.snippet.slice(0, 260) }));
  // learn_from only needs titles of stories NOT already in items — avoids sending the same text twice
  const sent = new Set(items.map((i) => i.id));
  const titles = learnPool.filter((i) => !sent.has(i.id)).map((i) => ({ id: i.id, title: i.title }));
  const body = {
    model: MODEL, max_completion_tokens: 7000,
    ...(EFFORT && { reasoning_effort: EFFORT }),
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify({ items: payload(items), learn_from: titles, top: top.map((i) => ({ title: i.title, text: i.snippet.slice(0, 200) })) }) }],
    response_format: { type: 'json_schema', json_schema: { name: 'edition', strict: true, schema: SCHEMA } },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      console.log('tokens', JSON.stringify(j.usage));
      if (j.choices[0].finish_reason === 'length') { console.warn('AI output cut off (raise max_completion_tokens or lower reasoning effort)'); return null; }
      return JSON.parse(j.choices[0].message.content);
    } catch (e) { console.warn('AI attempt failed:', e.message); await sleep(3000); }
  }
  return null;
}

// ---------- thumbnails: self-hosted (the site's CSP and privacy policy allow no third-party images) ----------
const IMG_DIR = 'public/img/news/';
mkdirSync(ROOT + IMG_DIR, { recursive: true });
// string = the page's picture, null = it has none, undefined = could not ask (network trouble: try again next run)
async function ogImage(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return res.status >= 500 || res.status === 429 ? undefined : null;
    const head = (await res.text()).slice(0, 200000);
    const m = head.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i) || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    return m && /^https:\/\//.test(m[1].replace(/&amp;/g, '&')) ? m[1].replace(/&amp;/g, '&') : null;
  } catch { return undefined; }
}
// busy photos can exceed the 130KB image budget at one fixed quality (test/site.test.mjs fails the whole run if one does), so step the quality
// down, then the width, until the file is comfortably small
export async function toWebp(buf, { width = 960, max = 110 * 1024 } = {}) {
  let out;
  for (const [w, q] of [[width, 70], [width, 58], [width, 46], [Math.round(width * 0.8), 46], [Math.round(width * 0.8), 36], [Math.round(width * 0.6), 36]]) {
    out = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: q }).toBuffer();
    if (out.length <= max) break;
  }
  return out;
}
const THUMB_UNTIL = Date.now() + 8 * 60e3; // pictures are a nicety: after 8 minutes the run stops fetching them (the job timeout is 15)
async function thumbnail(it) {
  const rel = `${IMG_DIR}${it.id}.webp`;
  if (existsSync(ROOT + rel)) return '/' + rel.slice('public/'.length);
  const plan = thumbPlan({ cache, id: it.id, date, now: Date.now(), deadline: THUMB_UNTIL });
  if (plan !== 'try') return null;
  let retry = false; // true when a failure was the network's, not a definite "no picture here"
  const candidates = [it.img, async () => { const o = await ogImage(it.url); if (o === undefined) retry = true; return o; }]; // the page is only opened if the feed's own picture fails
  for (const c of candidates) {
    const src = typeof c === 'function' ? await c() : c;
    if (!src) continue;
    try {
      const res = await fetch(src, { headers: { 'user-agent': UA, accept: 'image/*' }, signal: AbortSignal.timeout(12000) });
      if (!res.ok || !/^image\//.test(res.headers.get('content-type') ?? '')) { if (res.status >= 500 || res.status === 429) retry = true; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8e6) continue;
      const meta = await sharp(buf).metadata();
      if ((meta.width ?? 0) < 400 || (meta.height ?? 0) < 200) continue; // logos and icons
      const out = await toWebp(buf);
      if (out.length > 125 * 1024) continue; // test/site.test.mjs fails the whole run on an image over 130KB
      writeFileSync(ROOT + rel, out);
      return '/' + rel.slice('public/'.length);
    } catch { retry = true; /* try the next candidate */ }
  }
  if (!retry) cache['noimg:' + it.id] = { t: date, miss: true }; // no picture today: do not open the article again on every run
  return null;
}

// ---------- main ----------
const sources = read('config/sources.json', {});
const cache = read('data/cache.json', {});
const prev = read(`data/editions/${date}.json`, null);
if (prev?.items) prev.items.forEach((i) => { if (i.section === 'world') i.section = 'geo'; });
const health = [];
const pool = [], poolIds = new Set(); // one item per URL: a feed that lists a story twice would otherwise print the same anchor id twice
const rules = { geo: new RegExp(sources.relevance, 'i'), tech: new RegExp(sources.techRelevance, 'i') };
for (const section of ['cyber', 'warfare', 'geo']) {
  const results = await Promise.allSettled(sources[section].map((s) => pullFeed(s, section, rules)));
  results.forEach((r, i) => {
    const name = sources[section][i].name;
    if (r.status === 'fulfilled') { pool.push(...r.value.filter((x) => !poolIds.has(x.id) && poolIds.add(x.id))); health.push({ name, section, ok: true, n: r.value.length }); }
    else health.push({ name, section, ok: false, error: String(r.reason?.message || r.reason).slice(0, 80) });
  });
}
console.log(`feeds ok ${health.filter((h) => h.ok).length}/${health.length}, items ${pool.length}`);

const chosen = [];
for (const section of Object.keys(LIMITS)) {
  chosen.push(...clusterAndScore(pool.filter((i) => i.section === section), now).slice(0, LIMITS[section]));
}
// A network blip that fails most feeds must not replace a full edition with a thin one and deploy it: keep what is published and try again next run.
const latestFile = readdirSync(ROOT + 'data/editions').filter((f) => f.endsWith('.json')).sort().pop();
const verdict = publishVerdict({ health, items: chosen.length, prevItems: latestFile ? read('data/editions/' + latestFile, { items: [] }).items?.length ?? 0 : 0 });
if (!verdict.publish) {
  console.warn(`::warning title=Edition kept::${verdict.reason}; the published edition is left as it is`);
  await sideFeeds();
  process.exit(health.some((h) => h.ok) ? 0 : 1); // nothing answered at all is a failed run, as before
}
let kev = [];
try { kev = await pullKev(cache); } catch (e) { console.warn('KEV failed:', e.message); kev = prev?.kev ?? []; }

// Only unsummarised items go to the model. No new items + learn already written today => no call at all.
const fresh = chosen.filter((i) => process.env.FORCE_AI || !cache[i.id]?.summary);
let learn = prev?.learn ?? [], runToday = prev?.run_today ?? [], analysis = prev?.analysis ?? null;
const MIN_FRESH = Number(process.env.MIN_FRESH ?? 3); // frequent runs: only call the model when a few new stories have piled up
if (process.env.FORCE_AI || !learn.length || fresh.length >= MIN_FRESH) {
  const top = [...chosen].sort((a, b) => b.score - a.score).slice(0, 8);
  const ai = await summarise(fresh, chosen, top);
  if (ai) {
    const byId = new Map(chosen.map((i) => [i.id, i]));
    for (const a of ai.items) {
      const src = byId.get(a.id);
      if (!src) continue;
      const basis = src.title + ' ' + src.snippet;
      cache[a.id] = { t: date, summary: guardNumbers(a.summary, basis), why: guardNumbers(a.why, basis), tags: a.tags.slice(0, 3).map((t) => t.slice(0, 28)) };
    }
    runToday = ai.run_today.slice(0, 3);
    try {
      const basis = top.map((i) => i.title + ' ' + i.snippet.slice(0, 200)).join(' ');
      const a = ai.analysis, g = (t) => guardNumbers(String(t ?? ''), basis);
      const paragraphs = (a?.paragraphs ?? []).slice(0, 3).map(g).filter(Boolean);
      const takeaways = (a?.takeaways ?? []).slice(0, 3).map(g).filter(Boolean);
      const headline = g(a?.headline).slice(0, 140);
      if (headline && paragraphs.length) analysis = { headline, paragraphs, takeaways };
    } catch (e) { console.warn('analysis failed:', e.message); }
    learn = ai.learn.filter((l) => byId.has(l.from_id)).map((l) => ({ ...l, from: byId.get(l.from_id).url, fromSource: byId.get(l.from_id).source }));
  }
}

const noPhoto = new Set(['cyber', 'warfare', 'geo'].flatMap((s) => sources[s] ?? []).filter((x) => x.photos === false).map((x) => x.name)); // "photos": false in config/sources.json
for (const it of chosen) { const t = noPhoto.has(it.source) ? null : await thumbnail(it); if (t) it.image = t; }
// thumbnails live as long as an edition from the last 30 days uses them (file times mean nothing in a fresh CI checkout)
{
  const keep = new Set(chosen.map((i) => i.id)), oldest = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  for (const e of readdirSync(ROOT + 'data/editions')) if (e.slice(0, 10) >= oldest) for (const i of JSON.parse(readFileSync(ROOT + 'data/editions/' + e, 'utf8')).items) keep.add(i.id);
  for (const t of readdirSync(ROOT + IMG_DIR)) if (!keep.has(t.replace(/\.webp$/, ''))) unlinkSync(ROOT + IMG_DIR + t);
}
const items = chosen.map(({ img, ...i }) => ({ ...i, ...(cache[i.id] ?? {}), summary: cache[i.id]?.summary || i.snippet.slice(0, 220), ai: !!cache[i.id]?.summary }));
for (const k of Object.keys(cache)) if (cache[k].t && Date.parse(cache[k].t) < now.getTime() - 14 * 864e5) delete cache[k];

const state = read('data/state.json', { edition: 218, date: '2026-09-05' });
if (state.date !== date) { state.edition += 1; state.date = date; }
if (!items.length && !kev.length) { console.error('Nothing collected — not publishing an empty edition.'); process.exit(1); }

write(`data/editions/${date}.json`, { date, edition: state.edition, compiled: now.toISOString(), model: MODEL, items, kev, run_today: runToday, learn, ...(analysis && { analysis }), health });
write('data/cache.json', cache);
write('data/state.json', state);
console.log(`edition ${state.edition} (${date}): ${items.length} items, ${kev.length} KEV, ${fresh.length} needed summarising`);

await sideFeeds();

async function sideFeeds() {
  try { await updateDarkweb(); } catch (e) { console.warn('darkweb failed:', e.message); }
  try { await updateIntel(); } catch (e) { console.warn('intel failed:', e.message); } // ransomware.live listings and Have I Been Pwned breaches
}
