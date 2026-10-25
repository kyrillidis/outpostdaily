// Private client watch: checks everything Outpost already collects (news editions, Breaking, dark web claims, ransomware leak-site
// listings, confirmed breaches) for each client's names and domains and writes one report per client.
// Run it on your own machine: `npm run watch` reads ./watchlist.json (git-ignored, never commit it: the repo is public)
// and writes ./reports/<client>-<date>.md (also git-ignored). Matches are leads for an analyst to check, not confirmed incidents.
//   watchlist.json: [{ "client": "Acme Ltd", "terms": ["Acme", "Acme Holdings"], "domains": ["acme.com"] }]
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p, fb) => { try { return existsSync(ROOT + p) ? JSON.parse(readFileSync(ROOT + p, 'utf8')) : fb; } catch { return fb; } };
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// name terms match whole words ("Acme" does not match "Acmeville"); domains match anywhere ("acme.com" in a URL or text)
export function buildMatcher({ terms = [], domains = [] } = {}) {
  const parts = [
    ...terms.map((t) => String(t).trim()).filter((t) => t.length >= 3).map((t) => `(?<![\\p{L}\\p{N}])${escRe(t)}(?![\\p{L}\\p{N}])`),
    ...domains.map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter((d) => d.includes('.')).map(escRe),
  ];
  const re = parts.length ? new RegExp(parts.join('|'), 'iu') : null;
  return (text) => (re ? String(text ?? '').match(re)?.[0] ?? '' : '');
}

// feeds: the collected data files. Returns [{ where, hit, when, title, url }] newest first, within the last `days`.
export function matchClient(client, feeds, { now = Date.now(), days = 7 } = {}) {
  const test = buildMatcher(client), cutoff = now - days * 864e5, out = [];
  const add = (where, text, when, title, url) => {
    const hit = test(text);
    if (hit && (!when || Date.parse(when) >= cutoff || isNaN(Date.parse(when)))) out.push({ where, hit, when: when ?? '', title: String(title).slice(0, 200), url: url ?? '' });
  };
  for (const e of feeds.editions ?? []) for (const i of e.items ?? []) add('News', `${i.title} ${i.summary ?? ''} ${i.snippet ?? ''}`, i.published, i.title, i.url);
  for (const i of feeds.breaking?.items ?? []) add(i.group === 'darkweb' ? 'Dark web / X post' : 'Breaking', i.title, i.published, i.title, i.url);
  for (const i of feeds.darkweb?.items ?? []) add('Dark web claim', `${i.headline} ${i.claim}`, i.published, i.headline, i.url);
  for (const i of feeds.ransomware?.items ?? []) add('Ransomware leak-site listing', i.victim, i.published, `${i.group} lists "${i.victim}"`, i.url);
  for (const i of feeds.breaches?.items ?? []) add('Confirmed breach (HIBP)', `${i.name} ${i.domain}`, i.addedDate, `${i.name} breach (${i.count?.toLocaleString?.('en') ?? '?'} accounts)`, i.url);
  const seen = new Set();
  return out.filter((m) => !seen.has(m.url + m.title) && seen.add(m.url + m.title)).sort((a, b) => String(b.when).localeCompare(String(a.when)));
}

export function renderReport(client, matches, date = new Date().toISOString().slice(0, 10)) {
  const head = `# Outpost client watch: ${client.client}\n\nDate: ${date}. Matches on: ${[...(client.terms ?? []), ...(client.domains ?? [])].join(', ')}\n\n`;
  if (!matches.length) return head + 'No matches in the last period.\n';
  return head + matches.map((m) => `- **${m.where}** (${m.when ? m.when.slice(0, 16).replace('T', ' ') + ' UTC' : 'undated'}): ${m.title}${m.url ? ` — ${m.url}` : ''}`).join('\n') +
    '\n\nThese are unverified leads from public sources, not confirmed incidents. Check each one before telling the client.\n';
}

function loadFeeds() {
  const dir = ROOT + 'data/editions/';
  const editions = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().slice(-14).map((f) => read('data/editions/' + f, {})) : [];
  return { editions, breaking: read('data/breaking.json', {}), darkweb: read('data/darkweb.json', {}), ransomware: read('data/ransomware.json', {}), breaches: read('data/breaches.json', {}) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const list = (() => { try { return JSON.parse(readFileSync(resolve(process.argv[2] || ROOT + 'watchlist.json'), 'utf8')); } catch { return null; } })();
  if (!Array.isArray(list)) { console.error('No watchlist.json. Create one: [{ "client": "Acme", "terms": ["Acme"], "domains": ["acme.com"] }]'); process.exit(1); }
  const feeds = loadFeeds(), date = new Date().toISOString().slice(0, 10);
  mkdirSync(ROOT + 'reports', { recursive: true });
  for (const c of list) {
    const m = matchClient(c, feeds), file = `reports/${String(c.client).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${date}.md`;
    writeFileSync(ROOT + file, renderReport(c, m, date));
    console.log(`${c.client}: ${m.length} match${m.length === 1 ? '' : 'es'} -> ${file}`);
  }
}
