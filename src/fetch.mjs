// Collects today's edition: feeds + CISA KEV (no AI), then ONE small AI call to
// summarise only items we haven't summarised before. Writes data/editions/<date>.json.
// Every URL in the output comes from a feed; the model never produces links.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { clusterAndScore, guardNumbers } from './rank.mjs';

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

async function pullFeed(src, section, rules) {
  const res = await fetch(src.url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, text/xml, */*' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const doc = xml.parse(await res.text());
  const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  const cutoff = now.getTime() - WINDOW_H * 3600e3;
  const out = [];
  for (const e of list.slice(0, 25)) {
    const url = linkOf(e);
    const when = new Date(text(e.pubDate || e.published || e.updated || e['dc:date']));
    const title = clean(e.title);
    if (!/^https?:\/\//.test(url) || !title || isNaN(when) || when.getTime() < cutoff || when > now.getTime() + 3600e3) continue;
    const snippet = clean(e.description || e.summary || e['content:encoded'] || e.content).slice(0, 320);
    if (src.filter && !rules[src.filter === 'tech' ? 'tech' : 'geo'].test(title + ' ' + snippet)) continue; // general outlets: only on-topic items
    out.push({ id: sha(url), section, source: src.name, weight: src.weight ?? 0.5, title, url, snippet, published: when.toISOString() });
  }
  return out;
}

// ---------- CISA KEV + NVD CVSS ----------
async function pullKev(cache) {
  const res = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('KEV HTTP ' + res.status);
  const j = await res.json();
  const rows = j.vulnerabilities.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)).slice(0, 12);
  let nvdCalls = 0;
  for (const r of rows) {
    const key = 'cvss:' + r.cveID;
    if (cache[key] === undefined && nvdCalls < 12) {
      if (nvdCalls++) await sleep(6500); // NVD keyless limit: 5 req / 30 s
      try {
        const n = await fetch('https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=' + r.cveID, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
        const m = (await n.json())?.vulnerabilities?.[0]?.cve?.metrics ?? {};
        const cv = (m.cvssMetricV40 ?? m.cvssMetricV31 ?? m.cvssMetricV30 ?? [])[0]?.cvssData;
        cache[key] = cv ? { score: cv.baseScore, t: date } : { score: null, t: date };
      } catch { /* leave unset, retry tomorrow */ }
    }
    r.cvss = cache[key]?.score ?? null;
  }
  return rows.map((r) => ({
    cve: r.cveID, vendor: r.vendorProject, product: r.product, name: r.vulnerabilityName, added: r.dateAdded, due: r.dueDate,
    ransomware: r.knownRansomwareCampaignUse === 'Known', action: String(r.requiredAction || '').slice(0, 200), cvss: r.cvss,
    url: 'https://nvd.nist.gov/vuln/detail/' + r.cveID,
  }));
}

// ---------- AI (one batched call, new items only) ----------
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items', 'run_today', 'learn'],
  properties: {
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'summary', 'why', 'tags'],
      properties: { id: { type: 'string' }, summary: { type: 'string' }, why: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } } },
    run_today: { type: 'array', items: { type: 'string' } },
    learn: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['domain', 'term', 'explainer', 'from_id'],
      properties: { domain: { type: 'string', enum: ['cyber', 'warfare', 'geo'] }, term: { type: 'string' }, explainer: { type: 'string' }, from_id: { type: 'string' } } } },
  },
};
const SYSTEM = `You edit Outpost, a daily briefing on cybersecurity, modern warfare technology, geodata/GNSS and geopolitics for people learning the field.
Use ONLY the title and snippet supplied for each item. Never add names, numbers, dates, causes or outcomes that are not in them; if the snippet is thin, write less.
Per item: summary (max 35 words, plain, neutral, attribute claims: "X says"), why (max 20 words; cyber = what a defender should check or do; warfare = the technology or operational relevance; geo = the strategic or geospatial relevance), tags (1-3 short terms from the text).
run_today: 3 short defender actions, each grounded in a cyber item above.
learn: one entry each for domains "cyber", "warfare" and "geo": term = a concept that appears in that day's items, explainer = max 45 words defining it for a beginner, from_id = the item it came from.
learn may draw on items or learn_from (titles only). Return the item ids exactly as given.`;

async function summarise(items, learnPool) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.warn('OPENAI_API_KEY not set — using feed snippets only'); return null; }
  const payload = (list) => list.map((i) => ({ id: i.id, sec: i.section, src: i.source, title: i.title, text: i.snippet.slice(0, 260) }));
  // learn_from only needs titles of stories NOT already in items — avoids sending the same text twice
  const sent = new Set(items.map((i) => i.id));
  const titles = learnPool.filter((i) => !sent.has(i.id)).map((i) => ({ id: i.id, title: i.title }));
  const body = {
    model: MODEL, max_completion_tokens: 6000,
    ...(EFFORT && { reasoning_effort: EFFORT }),
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify({ items: payload(items), learn_from: titles }) }],
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

// ---------- main ----------
const sources = read('config/sources.json', {});
const cache = read('data/cache.json', {});
const prev = read(`data/editions/${date}.json`, null);
if (prev?.items) prev.items.forEach((i) => { if (i.section === 'world') i.section = 'geo'; });
const health = [];
const pool = [];
const rules = { geo: new RegExp(sources.relevance, 'i'), tech: new RegExp(sources.techRelevance, 'i') };
for (const section of ['cyber', 'warfare', 'geo']) {
  const results = await Promise.allSettled(sources[section].map((s) => pullFeed(s, section, rules)));
  results.forEach((r, i) => {
    const name = sources[section][i].name;
    if (r.status === 'fulfilled') { pool.push(...r.value); health.push({ name, section, ok: true, n: r.value.length }); }
    else health.push({ name, section, ok: false, error: String(r.reason?.message || r.reason).slice(0, 80) });
  });
}
console.log(`feeds ok ${health.filter((h) => h.ok).length}/${health.length}, items ${pool.length}`);

const chosen = [];
for (const section of Object.keys(LIMITS)) {
  chosen.push(...clusterAndScore(pool.filter((i) => i.section === section), now).slice(0, LIMITS[section]));
}
let kev = [];
try { kev = await pullKev(cache); } catch (e) { console.warn('KEV failed:', e.message); kev = prev?.kev ?? []; }

// Only unsummarised items go to the model. No new items + learn already written today => no call at all.
const fresh = chosen.filter((i) => process.env.FORCE_AI || !cache[i.id]?.summary);
let learn = prev?.learn ?? [], runToday = prev?.run_today ?? [];
if (fresh.length || !learn.length || process.env.FORCE_AI) {
  const ai = await summarise(fresh, chosen);
  if (ai) {
    const byId = new Map(chosen.map((i) => [i.id, i]));
    for (const a of ai.items) {
      const src = byId.get(a.id);
      if (!src) continue;
      const basis = src.title + ' ' + src.snippet;
      cache[a.id] = { t: date, summary: guardNumbers(a.summary, basis), why: guardNumbers(a.why, basis), tags: a.tags.slice(0, 3).map((t) => t.slice(0, 28)) };
    }
    runToday = ai.run_today.slice(0, 3);
    learn = ai.learn.filter((l) => byId.has(l.from_id)).map((l) => ({ ...l, from: byId.get(l.from_id).url, fromSource: byId.get(l.from_id).source }));
  }
}

const items = chosen.map((i) => ({ ...i, ...(cache[i.id] ?? {}), summary: cache[i.id]?.summary || i.snippet.slice(0, 220), ai: !!cache[i.id]?.summary }));
for (const k of Object.keys(cache)) if (cache[k].t && Date.parse(cache[k].t) < now.getTime() - 14 * 864e5) delete cache[k];

const state = read('data/state.json', { edition: 218, date: '2026-09-05' });
if (state.date !== date) { state.edition += 1; state.date = date; }
if (!items.length && !kev.length) { console.error('Nothing collected — not publishing an empty edition.'); process.exit(1); }

write(`data/editions/${date}.json`, { date, edition: state.edition, compiled: now.toISOString(), model: MODEL, items, kev, run_today: runToday, learn, health });
write('data/cache.json', cache);
write('data/state.json', state);
console.log(`edition ${state.edition} (${date}): ${items.length} items, ${kev.length} KEV, ${fresh.length} needed summarising`);
