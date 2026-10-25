// One place that turns the collected data files into the Dark web page body, used by the site build (src/render.mjs)
// and by the live endpoint (api/darkweb.js), so the page and its 5-minute refresh can never disagree.
import { normalizeBreaking } from './feed.mjs';
import { renderDarkwebBody } from './darkweb-view.mjs';

const TOPIC = /dark ?web|leak|breach|ransomware|threat actor|extortion|stolen|for sale|infostealer|credential|hacktivis/i;

// the newest of every file's own timestamp: changes whenever anything on the page changes
export function stampOf({ darkweb, ransomware, breaches, breaking } = {}) {
  return [darkweb, ransomware, breaches, breaking].map((d) => d?.updated).filter(Boolean).sort().pop() ?? null;
}

export function buildDarkweb({ darkweb = {}, ransomware = { items: [] }, breaches = { items: [] }, breaking = { items: [] }, cfg = {}, now = Date.now() } = {}) {
  const skip = new Set((cfg.excludeSources ?? []).map((x) => String(x).toLowerCase()));
  const claims = (Array.isArray(darkweb.items) ? darkweb.items : []).filter((i) => !skip.has(String(i.source ?? '').toLowerCase()));
  const news = normalizeBreaking((Array.isArray(breaking.items) ? breaking.items : []).filter((i) => i && i.kind === 'news' && i.group === 'darkweb'), cfg)
    .filter((i) => TOPIC.test(i.title)).sort((a, b) => String(b.published).localeCompare(String(a.published)));
  const html = renderDarkwebBody({ news, claims, ransomware, breaches, now, imageMode: cfg.darkwebImages ?? 'blur' });
  return { updated: stampOf({ darkweb, ransomware, breaches, breaking }), html };
}
