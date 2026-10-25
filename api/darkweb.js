// Live feed for the Dark web page: reads the collected data files from the repo without a redeploy and returns the finished
// page body, built by the same code as the site build (src/lib/darkweb-live.mjs), for src/assets/darkweb.js to swap in.
// Edge-cached for 60 s. Pictures are only attached by the hourly edition job (they must be deployed), so new claims show a drawn tile until then.
import { buildDarkweb } from '../src/lib/darkweb-live.mjs';

const RAW = 'https://raw.githubusercontent.com/kyrillidis/outpostdaily/main/';
const get = async (p) => {
  const r = await fetch(RAW + p, { headers: { 'user-agent': 'outpostdaily-live' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(p + ' ' + r.status);
  return r.json();
};

export default async function handler(req, res) {
  try {
    const [darkweb, ransomware, breaches, breaking, cfg] = await Promise.all(['data/darkweb.json', 'data/ransomware.json', 'data/breaches.json', 'data/breaking.json', 'config/breaking.json'].map(get));
    const out = buildDarkweb({ darkweb, ransomware, breaches, breaking, cfg, now: Date.now() });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    res.status(200).json(out);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'unavailable' });
  }
}
