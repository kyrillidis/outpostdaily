import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterAndScore, guardNumbers } from '../src/rank.mjs';

const now = new Date('2026-10-21T06:00:00Z');
const mk = (source, title, hoursAgo, weight = 0.5) => ({ source, title, weight, url: 'https://x/' + source + title.length, published: new Date(now - hoursAgo * 3600e3).toISOString() });

test('same story from two outlets collapses and gains corroboration', () => {
  const out = clusterAndScore([mk('A', 'Check Point patches critical VPN flaws', 2), mk('B', 'Check Point patches two critical VPN flaws', 3), mk('C', 'Totally unrelated story about oil', 1)], now);
  assert.equal(out.length, 2);
  assert.equal(out.find((i) => i.title.startsWith('Check Point')).also.length, 1);
});

test('fresher items outrank staler ones at equal weight', () => {
  const [first] = clusterAndScore([mk('A', 'Old thing happened here', 40), mk('B', 'New thing occurred there', 1)], now);
  assert.equal(first.source, 'B');
});

test('guardNumbers drops AI text containing numbers absent from the source', () => {
  assert.equal(guardNumbers('Hit 600 organisations', 'CISA says 600 orgs hit'), 'Hit 600 organisations');
  assert.equal(guardNumbers('Hit 900 organisations', 'CISA says 600 orgs hit'), '');
});
