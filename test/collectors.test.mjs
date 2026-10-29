// The 5-minute collector (src/breaking.mjs) against fixture responses: one malformed post, entry or link must never lose the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strip, isoOr, codePoint } from '../src/lib/feed.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));

test('strip drops numeric entities outside Unicode instead of throwing, and keeps the rest of its behaviour', () => {
  assert.equal(strip('a &#x110000; b &#1114112; c &#xD800; d &#0; e'), 'a b c d e');
  assert.equal(strip('Tom &amp; Jerry &quot;x&quot; &#x41;&#66; <b>bold</b> https://t.co/abc'), 'Tom & Jerry "x" AB bold');
  assert.equal(strip(null), '');
  assert.equal(codePoint(0x1f600), '😀');
});

test('isoOr gives an ISO time, or the fallback for a missing or invalid date', () => {
  assert.equal(isoOr('Tue Dec 10 07:00:30 +0000 2024', 'x'), '2024-12-10T07:00:30.000Z');
  for (const bad of [undefined, null, '', 'not a date', {}, NaN]) assert.equal(isoOr(bad, 'fallback'), 'fallback');
});

// ---- the whole script, offline: a stubbed fetch answers each source ----
function runBreaking({ tweets, rss, html }) {
  const dir = mkdtempSync(join(tmpdir(), 'outpost-breaking-'));
  try {
    cpSync(join(REPO, 'src'), join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'config')); mkdirSync(join(dir, 'data'));
    symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
    const cfg = JSON.parse(readFileSync(join(REPO, 'config/breaking.json'), 'utf8'));
    cfg.x = { cyber: ['someone'] }; cfg.news = [{ name: 'Feed', group: 'cyber', url: 'https://feed.test/rss' }]; cfg.forums = [{ name: 'Forum', url: 'https://forum.test/' }];
    writeFileSync(join(dir, 'config/breaking.json'), JSON.stringify(cfg));
    writeFileSync(join(dir, 'stub.mjs'), `const B = ${JSON.stringify({ tweets, rss, html })};
globalThis.fetch = async (url) => { url = String(url);
  if (url.includes('twitterapi.io')) return { ok: true, status: 200, json: async () => ({ tweets: B.tweets }) };
  if (url.includes('feed.test')) return { ok: true, status: 200, text: async () => B.rss };
  if (url.includes('forum.test')) return { ok: true, status: 200, text: async () => B.html };
  return { ok: false, status: 404 }; };`);
    execFileSync('node', ['--import', './stub.mjs', 'src/breaking.mjs'], { cwd: dir, stdio: 'pipe', env: { PATH: process.env.PATH, TWITTERAPI_KEY: 'test-only' } });
    return JSON.parse(readFileSync(join(dir, 'data/breaking.json'), 'utf8'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('malformed posts, entries and links are skipped one by one; the good ones in the same group survive', () => {
  const recent = new Date(Date.now() - 60e3).toUTCString();
  const out = runBreaking({
    tweets: [
      { id: '1', text: 'Ransomware group claims a major breach of a hospital network today', createdAt: 'garbage', author: { userName: 'a' } },
      { id: '2', text: 'Critical zero-day exploited in the wild, patch now &#x110000; please', createdAt: new Date().toISOString(), author: { userName: 'b' } },
      { id: '3', text: 'Another ransomware incident reported by a large retailer this morning', author: { userName: 'c' } },
      { id: '4', text: 'Malware campaign targets defence contractors with a new loader family', createdAt: new Date().toISOString(), author: { userName: 'd' } },
    ],
    rss: `<rss><channel><item><title>Broken date entry about a ransomware attack</title><link>https://example.com/1</link><pubDate>nonsense</pubDate></item><item><title>Hackers breach a major bank &#x110000; today</title><link>https://example.com/2</link><pubDate>${recent}</pubDate></item></channel></rss>`,
    html: '<a href="/Thread-Selling-database-access-for-bank">Selling database &#x110000; access for a bank</a><a href="/Thread-Another-leak-of-customer-data">Another leak of customer data for sale</a>',
  });
  const by = (kind) => out.items.filter((i) => i.kind === kind);
  assert.equal(by('x').length, 4, 'all four posts are kept, including the ones with a bad or missing date');
  for (const i of by('x')) assert.ok(!isNaN(Date.parse(i.published)), 'every post has a real timestamp');
  assert.ok(by('x').find((i) => i.id === 'x2').title.includes('patch now'), 'the out-of-range entity is dropped from the text, the post is kept');
  assert.equal(by('news').length, 1, 'the entry with a good date survives; the one with a bad date is skipped');
  assert.equal(by('forum').length, 2);
  assert.deepEqual(out.health.filter((h) => !h.ok), [], 'no source is reported failed because of one bad item');
});
