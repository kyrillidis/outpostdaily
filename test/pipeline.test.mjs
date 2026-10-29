// Pure decisions of the edition job (src/lib/pipeline.mjs): what counts as a feed, a definitive NVD answer, a publishable run, a thumbnail attempt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { feedEntries, checkDates, nvdVerdict, cvssCached, publishVerdict, thumbPlan } from '../src/lib/pipeline.mjs';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: false });
const parse = (s) => xml.parse(s);

// ---------- feeds ----------
test('RSS, Atom and RDF documents give their entries', () => {
  assert.equal(feedEntries(parse('<rss><channel><item><title>a</title></item><item><title>b</title></item></channel></rss>')).length, 2);
  assert.equal(feedEntries(parse('<rss><channel><item><title>a</title></item></channel></rss>')).length, 1, 'a single item is not an array in the parsed tree');
  assert.equal(feedEntries(parse('<feed><entry><title>a</title></entry></feed>')).length, 1);
  assert.equal(feedEntries(parse('<rdf:RDF><item><title>a</title></item></rdf:RDF>')).length, 1);
});

test('an HTML or captcha page is not a healthy feed with zero items', () => {
  assert.throws(() => feedEntries(parse('<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>')), /not a feed/);
  assert.throws(() => feedEntries(parse('')), /not a feed/);
  assert.throws(() => feedEntries(parse('Access denied')), /not a feed/);
  assert.throws(() => feedEntries(parse('<rss><channel><title>x</title></channel></rss>')), /no entries/);
});

test('a feed where no entry has a readable date is reported, one with a single readable date is not', () => {
  assert.throws(() => checkDates(10, 0), /readable date/);
  assert.doesNotThrow(() => checkDates(10, 1));
  assert.doesNotThrow(() => checkDates(0, 0), 'nothing parsed is the "no entries" case, already reported');
});

// ---------- NVD ----------
const NVD = (metrics) => ({ vulnerabilities: [{ cve: { metrics } }] });
test('NVD: a score is read from v4.0, then v3.1, then v3.0', () => {
  assert.deepEqual(nvdVerdict(NVD({ cvssMetricV31: [{ cvssData: { baseScore: 9.8 } }] })), { score: 9.8 });
  assert.deepEqual(nvdVerdict(NVD({ cvssMetricV40: [{ cvssData: { baseScore: 8.7 } }], cvssMetricV31: [{ cvssData: { baseScore: 9.8 } }] })), { score: 8.7 });
});
test('NVD: "not scored yet" is an answer, an error or rate-limit body is not', () => {
  assert.deepEqual(nvdVerdict(NVD({})), { score: null });
  assert.deepEqual(nvdVerdict({ vulnerabilities: [] }), { score: null });
  assert.equal(nvdVerdict({ message: 'rate limited' }), null);
  assert.equal(nvdVerdict(null), null);
  assert.equal(nvdVerdict('<html>'), null);
});
test('NVD: a score is trusted for as long as the cache keeps it, a null only for the day it was seen', () => {
  assert.equal(cvssCached({ score: 7.5, t: '2026-10-01' }, '2026-10-29'), true);
  assert.equal(cvssCached({ score: 0, t: '2026-10-01' }, '2026-10-29'), true);
  assert.equal(cvssCached({ score: null, t: '2026-10-29' }, '2026-10-29'), true);
  assert.equal(cvssCached({ score: null, t: '2026-10-28' }, '2026-10-29'), false, 'asked again the next day, not cached for 14 days');
  assert.equal(cvssCached(undefined, '2026-10-29'), false);
});

// ---------- publish guard ----------
const feeds = (ok, bad) => [...Array(ok).fill({ ok: true }), ...Array(bad).fill({ ok: false })];
test('guard: a healthy run publishes', () => assert.equal(publishVerdict({ health: feeds(31, 1), items: 26, prevItems: 26 }).publish, true));
test('guard: fewer than half of the feeds answering keeps the previous edition', () => {
  const v = publishVerdict({ health: feeds(10, 22), items: 20, prevItems: 26 });
  assert.equal(v.publish, false);
  assert.match(v.reason, /10 of 32 feeds/);
  assert.equal(publishVerdict({ health: feeds(16, 16), items: 20, prevItems: 26 }).publish, true, 'exactly half is enough');
  assert.equal(publishVerdict({ health: feeds(15, 17), items: 20, prevItems: 26 }).publish, false);
});
test('guard: an item count far below the previous edition keeps it, a quiet weekend does not', () => {
  assert.equal(publishVerdict({ health: feeds(32, 0), items: 9, prevItems: 26 }).publish, false);
  assert.equal(publishVerdict({ health: feeds(32, 0), items: 17, prevItems: 26 }).publish, true, 'the real 2026-10-25 edition (17 of 26) must still publish');
  assert.equal(publishVerdict({ health: feeds(32, 0), items: 1, prevItems: 6 }).publish, true, 'a small previous edition is not a baseline');
});
test('guard: with no previous edition there is nothing to protect', () => assert.equal(publishVerdict({ health: feeds(0, 32), items: 0, prevItems: 0 }).publish, true));

// ---------- thumbnails ----------
test('thumbnails: out of time means skip (and ask again next run), a miss found today is not asked again today', () => {
  const base = { cache: {}, id: 'abc', date: '2026-10-29', now: 1000, deadline: 2000 };
  assert.equal(thumbPlan(base), 'try');
  assert.equal(thumbPlan({ ...base, now: 2000 }), 'budget');
  assert.equal(thumbPlan({ ...base, cache: { 'noimg:abc': { t: '2026-10-29', miss: true } } }), 'missed');
  assert.equal(thumbPlan({ ...base, cache: { 'noimg:abc': { t: '2026-10-28', miss: true } } }), 'try', 'a day later it is tried again');
  assert.equal(thumbPlan({ ...base, cache: { 'noimg:other': { t: '2026-10-29' } } }), 'try');
});

// ---------- AI summaries ----------
import { needsSummary } from '../src/lib/pipeline.mjs';
test('summaries: a story whose summary was dropped by the number guard counts as asked, not as new forever', () => {
  assert.equal(needsSummary(undefined), true);
  assert.equal(needsSummary({ t: 'd', summary: '', why: '', tags: [] }), true, 'the old empty entry would be asked again (this was the bug)');
  assert.equal(needsSummary({ t: 'd', summary: '', tried: true }), false);
  assert.equal(needsSummary({ t: 'd', summary: 'Text.' }), false);
});
