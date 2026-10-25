// Live feed for the Breaking desk: reads data/breaking.json from the repo without a redeploy, runs the same normalising and
// rendering code as the page build, and returns the finished desk as HTML for the page to swap in (src/assets/breaking.js).
// Edge-cached for 60 s, so many readers cost one function call a minute. Forum listings stay on /dark-web/.
import { normalizeBreaking } from '../src/lib/feed.mjs';
import { renderBreakingBody } from '../src/lib/breaking-view.mjs';

const RAW = 'https://raw.githubusercontent.com/kyrillidis/outpostdaily/main/';
const get = async (p) => {
  const r = await fetch(RAW + p, { headers: { 'user-agent': 'outpostdaily-live' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(p + ' ' + r.status);
  return r.json();
};

export default async function handler(req, res) {
  try {
    const [d, c] = await Promise.all([get('data/breaking.json'), get('config/breaking.json')]);
    const items = normalizeBreaking((Array.isArray(d.items) ? d.items : []).filter((i) => i && i.kind !== 'forum'), c);
    const updated = d.updated ?? null;
    const html = renderBreakingBody({ items, health: d.health ?? [], updated, now: Date.now() });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    res.status(200).json({ updated, html });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'unavailable' });
  }
}
