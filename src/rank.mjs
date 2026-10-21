// Pure helpers: dedupe near-identical headlines across outlets, score, and guard AI output.

const STOP = new Set('a an the of to in on for and or at by with from as is are be new over after says say amid into its it this that'.split(' '));
const tokens = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n || 1);
};

// Same story from several outlets -> one item, with the other outlets kept as corroboration.
export function clusterAndScore(items, now = new Date()) {
  const clusters = [];
  for (const it of items.sort((a, b) => b.weight - a.weight)) {
    const tk = tokens(it.title);
    const hit = clusters.find((c) => c.lead.source !== it.source && jaccard(c.tk, tk) >= 0.45);
    if (hit) hit.also.push({ source: it.source, url: it.url });
    else clusters.push({ lead: it, tk, also: [] });
  }
  return clusters
    .map(({ lead, also }) => {
      const ageH = (now - new Date(lead.published)) / 3600e3;
      const score = lead.weight + Math.max(0, 1 - ageH / 48) + Math.min(also.length, 4) * 0.35;
      return { ...lead, also: also.slice(0, 3), score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score);
}

// Cheap hallucination guard: any number in the AI text must appear in the source text, else drop the AI text.
export function guardNumbers(aiText, basis) {
  const nums = String(aiText).match(/\d[\d,.]*/g) ?? [];
  const norm = (s) => s.replace(/[,.]+$/, '');
  return nums.every((n) => basis.includes(norm(n))) ? String(aiText).trim() : '';
}
