// Dark web context articles: one batched AI call per run for NEW forum/ransomware/darkweb-X claims.
// The original claim link is kept unchanged; AI text is framed as an unverified claim plus general background.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p, fb) => { try { return existsSync(ROOT + p) ? JSON.parse(readFileSync(ROOT + p, 'utf8')) : fb; } catch { return fb; } };
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const EFFORT = process.env.REASONING_EFFORT ?? (/^gpt-[56]/.test(MODEL) ? 'low' : '');
const KEEP_DAYS = 14, MAX_ITEMS = 40, MAX_NEW = 12;
// emails, key/token-like strings, long hex/base64 blobs, "password:" style leaks
const SENSITIVE = /[\w.+-]+@[\w-]+\.[\w.-]+|\b(?:sk|pk|ghp|AKIA|xox[bap]|AIza)[-_A-Za-z0-9]{12,}|\b[A-Fa-f0-9]{32,}\b|\b[A-Za-z0-9+/_-]{32,}={0,2}(?=\s|$)|\b(?:password|passwd|pwd|api[_ -]?key|token|secret)\s*[:=]\s*\S+/i;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'headline', 'claim', 'context', 'advice'],
    properties: { id: { type: 'string' }, headline: { type: 'string' }, claim: { type: 'string' }, context: { type: 'string' }, advice: { type: 'array', items: { type: 'string' } } } } } },
};
const SYSTEM = `You write short context notes for Outpost, a neutral cybersecurity briefing, about UNVERIFIED claims posted on forums, ransomware leak sites or social media.
Per item (use the id exactly as given):
headline: neutral rewrite, max 100 characters, always framed as a claim ("Actor claims ...", "Group lists ... on leak site"). Never state the claim as fact.
claim: ONE sentence saying what is alleged, using only the supplied title.
context: 2-3 sentences of GENERAL background about this kind of claim, sector or threat type. State clearly it is general knowledge, not facts about this incident. Do not mention specifics of this incident beyond the title.
advice: exactly 2 short defender actions (max 20 words each).
Never invent victim details, names, numbers, dates or outcomes. Never include credentials, personal data or leaked content. Do not repeat numbers not in the title.`;

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

async function callModel(list) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const body = {
    model: MODEL, max_completion_tokens: 3000,
    ...(EFFORT && { reasoning_effort: EFFORT }),
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify({ items: list.map((i) => ({ id: i.id, kind: i.kind, source: i.source, title: clip(i.title, 300) })) }) }],
    response_format: { type: 'json_schema', json_schema: { name: 'darkweb', strict: true, schema: SCHEMA } },
  };
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    console.log('darkweb tokens', JSON.stringify(j.usage));
    if (j.choices[0].finish_reason === 'length') { console.warn('darkweb AI output cut off'); return null; }
    return JSON.parse(j.choices[0].message.content);
  } catch (e) { console.warn('darkweb AI failed:', e.message); return null; }
}

// X posts in the dark web group are only written up when they are actually about a security event
const SECURITY = /\b(ransomware|breach\w*|leak\w*|hack\w*|data|records|customers?|victims?|vulnerabilit\w*|flaws?|exploit\w*|malware|ddos|targeted|attack\w*|extortion|portal|access|credentials?|patch\w*|certificate|threat|cyber\w*|stolen|sale|sells?|selling|compromis\w*|websites?|defacement|forum|qilin|lockbit|akira|cl0p|clop|blackcat|alphv|rhysida|medusa|bianlian|safepay|everest|dragonforce|cloak|falcon|panzer|inc ransom|play ransom|hunters)\b/i;

export async function updateDarkweb({ now = new Date(), call = callModel } = {}) {
  const breaking = read('data/breaking.json', { items: [] });
  const store = read('data/darkweb.json', { items: [] });
  const skip = new Set((read('config/breaking.json', {}).excludeSources ?? []).map((x) => String(x).toLowerCase()));
  const allowed = (i) => !skip.has(String(i.source ?? '').toLowerCase());
  const known = new Map((store.items ?? []).filter(allowed).map((i) => [i.id, i]));
  const fresh = (breaking.items ?? [])
    .filter((i) => (i.kind === 'forum' || i.kind === 'ransomware' || (i.kind === 'x' && i.group === 'darkweb')) && i.id && i.title && /^https?:\/\//.test(i.url ?? ''))
    .filter((i) => i.kind !== 'x' || SECURITY.test(i.title))
    .filter((i) => allowed(i) && !known.has(i.id) && !SENSITIVE.test(i.title))
    .sort((a, b) => String(b.published).localeCompare(String(a.published))).slice(0, MAX_NEW);
  if (fresh.length) {
    const ai = await call(fresh);
    const by = new Map((ai?.items ?? []).map((a) => [a.id, a]));
    for (const i of fresh) {
      const a = by.get(i.id);
      const ok = a && ![a.headline, a.claim, a.context, ...(a.advice ?? [])].some((t) => SENSITIVE.test(String(t)));
      known.set(i.id, {
        id: i.id, kind: i.kind, source: i.source, url: i.url, published: i.published,
        headline: clip(ok && a.headline || i.title, 100), claim: clip(ok && a.claim || i.title, 300),
        context: ok ? clip(a.context, 600) : '', advice: ok ? (a.advice ?? []).slice(0, 2).map((t) => clip(t, 160)) : [], verified: false,
      });
    }
  }
  const cutoff = now.getTime() - KEEP_DAYS * 864e5;
  const items = [...known.values()].filter((i) => Date.parse(i.published) >= cutoff)
    .sort((a, b) => String(b.published).localeCompare(String(a.published))).slice(0, MAX_ITEMS);
  writeFileSync(ROOT + 'data/darkweb.json', JSON.stringify({ updated: now.toISOString(), items }, null, 1) + '\n');
  console.log(`darkweb: ${fresh.length} new, ${items.length} kept`);
  return items;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await updateDarkweb().catch((e) => console.warn('darkweb failed:', e.message));
