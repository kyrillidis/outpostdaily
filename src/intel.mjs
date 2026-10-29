// Open-data feeds for the Dark web page, refreshed by the 2-hourly edition job. Both are licensed CC BY 4.0, which allows commercial
// use with credit, so the page must credit and link each source:
//   data/ransomware.json  RansomLook (ransomlook.io) public API: leak-site listings (group, victim name, time). Claims, not confirmed incidents.
//   data/breaches.json    Have I Been Pwned public breach list: confirmed breaches.
// Deliberately NOT collected: leak-site screenshots (they can show stolen data), ransomware.live (free for non-commercial use only;
// Outpost carries ads) and darkwebinformer.com (its terms prohibit automated collection and redistribution without written permission).
// See docs/DATA-SOURCES.md.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decode, RANSOM_GROUPS } from './lib/feed.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UA = 'OutpostDailyBot/1.0 (+https://www.outpostdaily.com)';
const read = (p, fb) => { try { return existsSync(ROOT + p) ? JSON.parse(readFileSync(ROOT + p, 'utf8')) : fb; } catch { return fb; } };
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
const RANSOM_KEEP_DAYS = 7, RANSOM_MAX = 1500, BREACH_KEEP_DAYS = 45, BREACH_MAX = 30, BREACH_REFRESH_H = 6;

// RansomLook /api/posts?days=7 -> [{ group_name, post_title, discovered }]. Titles that are links or onion addresses are announcements, not victims.
export function parseRansomLook(json) {
  const out = [];
  for (const e of Array.isArray(json?.posts) ? json.posts : []) {
    const slug = String(e?.group_name ?? '').trim(), victim = decode(String(e?.post_title ?? '')).replace(/\s+/g, ' ').trim(), when = new Date(e?.discovered || NaN);
    if (!slug || victim.length < 2 || /https?:\/\/|\.onion|www\./i.test(victim) || isNaN(when)) continue;
    const group = RANSOM_GROUPS.find((g) => g.toLowerCase() === slug.toLowerCase()) ?? slug.charAt(0).toUpperCase() + slug.slice(1);
    out.push({ id: sha(`${slug}|${victim}|${when.toISOString()}`), group, victim: victim.slice(0, 140), country: '', published: when.toISOString(), url: `https://www.ransomlook.io/group/${encodeURIComponent(slug)}` });
  }
  return out;
}

const plain = (html) => decode(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
const shorten = (t, n = 240) => (t.length <= n ? t : (t.slice(0, n).match(/^.*[.!?](?=\s)/)?.[0] ?? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'));

// Confirmed breaches added to HIBP recently. Excludes fabricated data, spam lists, stealer-log corpora and sensitive (adult) sites.
export function pickBreaches(list, now = Date.now()) {
  return (Array.isArray(list) ? list : [])
    .filter((b) => b && !b.IsFabricated && !b.IsSpamList && !b.IsStealerLog && !b.IsSensitive && !b.IsRetired && now - Date.parse(b.AddedDate) < BREACH_KEEP_DAYS * 864e5)
    .sort((a, b) => String(b.AddedDate).localeCompare(String(a.AddedDate)))
    .slice(0, BREACH_MAX)
    .map((b) => ({
      name: b.Title || b.Name, slug: b.Name, domain: b.Domain || '', breachDate: b.BreachDate, addedDate: b.AddedDate, count: b.PwnCount ?? 0,
      classes: (b.DataClasses ?? []).slice(0, 8), verified: !!b.IsVerified, description: shorten(plain(b.Description)),
      url: `https://haveibeenpwned.com/Breach/${encodeURIComponent(b.Name)}`,
    }));
}

async function get(url, accept) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res;
}

export async function updateIntel({ now = new Date() } = {}) {
  const t = now.getTime();
  // ---- RansomLook leak-site listings (rolling 7 days) ----
  try {
    const prev = read('data/ransomware.json', { items: [] });
    const fresh = parseRansomLook(await (await get('https://www.ransomlook.io/api/posts?days=7', 'application/json')).json());
    const byId = new Map((prev.items ?? []).map((i) => [i.id, i]));
    let added = 0;
    for (const i of fresh) if (!byId.has(i.id)) { byId.set(i.id, i); added++; }
    const items = [...byId.values()].filter((i) => t - Date.parse(i.published) < RANSOM_KEEP_DAYS * 864e5).sort((a, b) => b.published.localeCompare(a.published)).slice(0, RANSOM_MAX);
    if (added || items.length !== (prev.items ?? []).length || prev.source !== 'RansomLook') writeFileSync(ROOT + 'data/ransomware.json', JSON.stringify({ updated: now.toISOString(), source: 'RansomLook', items }) + '\n');
    console.log(`RansomLook: +${added} new, ${items.length} kept`);
  } catch (e) { console.warn('RansomLook failed:', e.message); }
  // ---- Have I Been Pwned confirmed breaches (refresh at most every few hours) ----
  try {
    const prev = read('data/breaches.json', { updated: null, items: [] });
    // "updated" is when the list last changed (the page shows it); "checked" is when we last asked, so an unchanged list is not re-fetched every run
    const last = Date.parse(prev.checked ?? prev.updated);
    if (last && t - last < BREACH_REFRESH_H * 36e5) { console.log('HIBP: fresh enough, skipped'); return; }
    const raw = await (await get('https://haveibeenpwned.com/api/v3/breaches', 'application/json')).json();
    if (!Array.isArray(raw) || !raw.length) throw new Error('empty or unexpected reply, keeping the stored list'); // the full list has hundreds of entries: an empty one is a fault, not news
    const items = pickBreaches(raw, t);
    const changed = JSON.stringify(items) !== JSON.stringify(prev.items);
    writeFileSync(ROOT + 'data/breaches.json', JSON.stringify({ updated: changed || !prev.updated ? now.toISOString() : prev.updated, checked: now.toISOString(), source: 'Have I Been Pwned', items }) + '\n');
    console.log(`HIBP: ${items.length} breaches in the last ${BREACH_KEEP_DAYS} days`);
  } catch (e) { console.warn('HIBP failed:', e.message); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await updateIntel();
