// Live feed for the Breaking dashboard: serves data/breaking.json from the repo without a redeploy.
// Edge-cached for 60 s, so many readers cost one function call a minute. Applies the same war-room filter as the build.
const RAW = 'https://raw.githubusercontent.com/kyrillidis/outpostdaily/main/';
const get = async (p) => {
  const r = await fetch(RAW + p, { headers: { 'user-agent': 'outpostdaily-live' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(p + ' ' + r.status);
  return r.json();
};

export default async function handler(req, res) {
  try {
    const [d, c] = await Promise.all([get('data/breaking.json'), get('config/breaking.json')]);
    const relevant = new RegExp(c.crisisRelevant ?? '$^', 'i');
    const items = d.items.filter((i) => !(i.group === 'crisis' && i.kind === 'news' && !relevant.test(i.title)));
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    res.status(200).json({ updated: d.updated, health: d.health, items });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'unavailable' });
  }
}
