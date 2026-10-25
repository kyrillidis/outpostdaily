import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatcher, matchClient, renderReport } from '../src/client-monitor.mjs';

const now = Date.parse('2026-10-26T00:00:00Z');
const feeds = {
  editions: [{ items: [{ title: 'Acme Ltd hit by outage', summary: '', url: 'https://n.example/1', published: '2026-10-25T10:00:00Z' }, { title: 'Acmeville flood', url: 'https://n.example/2', published: '2026-10-25T10:00:00Z' }] }],
  breaking: { items: [{ title: 'Leak of acme.com staff list', group: 'darkweb', url: 'https://x.com/a/status/1', published: '2026-10-25T20:00:00Z' }] },
  darkweb: { items: [] },
  ransomware: { items: [{ group: 'Qilin', victim: 'ACME Ltd', url: 'https://www.ransomlook.io/group/qilin', published: '2026-10-20T00:00:00Z' }, { group: 'Qilin', victim: 'Acme old', url: 'u', published: '2026-09-01T00:00:00Z' }] },
  breaches: { items: [] },
};

test('terms match whole words, domains match anywhere', () => {
  const m = buildMatcher({ terms: ['Acme'], domains: ['https://www.acme.com/x'] });
  assert.equal(m('Acme Ltd'), 'Acme');
  assert.equal(m('Acmeville'), '');
  assert.ok(m('see acme.com/staff'));
  assert.equal(buildMatcher({ domains: ['acme.com'] })('see ACME.com/staff'), 'ACME.com');
  assert.equal(buildMatcher({ terms: ['ab'] })('ab'), '', 'terms under three letters are ignored');
});

test('matchClient searches every feed, keeps only the last 7 days and sorts newest first', () => {
  const r = matchClient({ client: 'Acme', terms: ['Acme'], domains: ['acme.com'] }, feeds, { now });
  assert.deepEqual(r.map((x) => x.where), ['Dark web / X post', 'News', 'Ransomware leak-site listing']);
});

test('the report says matches are unverified leads and handles an empty result', () => {
  const c = { client: 'Acme', terms: ['Acme'] };
  assert.match(renderReport(c, matchClient(c, feeds, { now }), '2026-10-26'), /unverified leads/);
  assert.match(renderReport(c, [], '2026-10-26'), /No matches/);
});
