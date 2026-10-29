// Pure decisions for the edition job (src/fetch.mjs), kept here so they can be tested without a network or a clock.

// ---- is this response actually a feed? ----
// An HTML or captcha page parses "successfully" into nothing, so it used to be reported as a healthy feed with 0 items.
export function feedEntries(doc) {
  const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item;
  if (raw === undefined && !(doc?.rss || doc?.feed || doc?.['rdf:RDF'])) throw new Error('not a feed (HTML or captcha page?)');
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!list.length) throw new Error('feed has no entries');
  return list;
}
// a feed whose every date is unreadable can never contribute an item, so say so
export const checkDates = (parsed, usable) => { if (parsed > 0 && usable === 0) throw new Error('no entry has a readable date'); };

// ---- NVD: only a definitive answer is worth a long cache ----
// -> { score } when NVD answered (score null = the CVE is not scored yet), or null when the body is an error or rate-limit message
export function nvdVerdict(json) {
  const v = json?.vulnerabilities;
  if (!Array.isArray(v)) return null;
  const m = v[0]?.cve?.metrics ?? {};
  const cv = (m.cvssMetricV40 ?? m.cvssMetricV31 ?? m.cvssMetricV30 ?? [])[0]?.cvssData;
  return { score: typeof cv?.baseScore === 'number' ? cv.baseScore : null };
}
// a score stays cached; "not scored yet" is trusted for the day it was seen and asked again the next day
export const cvssCached = (entry, today) => !!entry && (entry.score != null || entry.t === today);

// ---- do not overwrite a good edition with the leftovers of a bad run ----
// health: [{ ok }] for the feeds we asked; prevItems: the previous edition's item count (0 = none to protect)
export function publishVerdict({ health, items, prevItems = 0, minOkFraction = 0.5, minItemFraction = 0.4 }) {
  if (!prevItems) return { publish: true };
  const ok = health.filter((h) => h.ok).length;
  if (ok < health.length * minOkFraction) return { publish: false, reason: `only ${ok} of ${health.length} feeds answered` };
  if (prevItems >= 10 && items < prevItems * minItemFraction) return { publish: false, reason: `${items} stories against ${prevItems} in the previous edition` };
  return { publish: true };
}

// ---- thumbnails: bounded time, and a story with no picture is not re-fetched every run ----
// -> 'try' | 'budget' (out of time, ask again next run) | 'missed' (already found no picture today)
export function thumbPlan({ cache, id, date, now, deadline }) {
  if (cache['noimg:' + id]?.t === date) return 'missed';
  return now >= deadline ? 'budget' : 'try';
}

// ---- AI summaries ----
// guardNumbers() empties a summary that quotes a number the source does not contain. That story still has to count as "asked": otherwise it
// stays unsummarised, is sent to the model again on every run, and keeps tripping the "enough new stories" threshold.
export const needsSummary = (entry) => !entry?.summary && !entry?.tried;
