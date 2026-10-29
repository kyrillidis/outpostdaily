// updateIntel (src/intel.mjs, Have I Been Pwned part) against a throw-away copy of the repo with a stubbed fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const NOW = '2026-10-29T12:00:00.000Z';
const ago = (h) => new Date(Date.parse(NOW) - h * 36e5).toISOString();
const hibp = (name, added) => ({ Name: name, Title: name, Domain: name + '.com', BreachDate: '2026-10-01', AddedDate: added, PwnCount: 5, DataClasses: ['Email addresses'], IsVerified: true, Description: 'A breach.' });
const ROW = { name: 'Old', slug: 'Old', domain: 'Old.com', breachDate: '2026-10-01', addedDate: ago(24), count: 5, classes: ['Email addresses'], verified: true, description: 'A breach.', url: 'https://haveibeenpwned.com/Breach/Old' };

function run({ file, reply }) {
  const dir = mkdtempSync(join(tmpdir(), 'outpost-intel-'));
  try {
    cpSync(join(REPO, 'src'), join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'data'));
    symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
    writeFileSync(join(dir, 'data/breaches.json'), JSON.stringify(file));
    writeFileSync(join(dir, 'driver.mjs'), `import { updateIntel } from './src/intel.mjs';
let hibpCalls = 0;
globalThis.fetch = async (url) => { url = String(url);
  if (url.includes('ransomlook')) return { ok: true, status: 200, json: async () => ({ posts: [] }) };
  hibpCalls++; return { ok: true, status: 200, json: async () => (${JSON.stringify(reply)}) }; };
await updateIntel({ now: new Date(${JSON.stringify(NOW)}) });
console.log('CALLS ' + hibpCalls);`);
    const out = execFileSync('node', ['driver.mjs'], { cwd: dir, encoding: 'utf8' });
    return { calls: +out.match(/CALLS (\d+)/)[1], file: JSON.parse(readFileSync(join(dir, 'data/breaches.json'), 'utf8')) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('HIBP: the 6-hour wait counts from when we last asked, not from when the list last changed', () => {
  const r = run({ file: { updated: ago(24 * 20), checked: ago(1), items: [ROW] }, reply: [hibp('Old', ago(24))] });
  assert.equal(r.calls, 0, 'asked an hour ago: no request, although the list itself last changed 20 days ago');
});

test('HIBP: an unchanged list keeps its "updated" time and records that we checked', () => {
  const r = run({ file: { updated: ago(24 * 20), checked: ago(7), items: [ROW] }, reply: [hibp('Old', ago(24))] });
  assert.equal(r.calls, 1);
  assert.equal(r.file.updated, ago(24 * 20), 'the page keeps showing when the list last changed');
  assert.equal(r.file.checked, NOW);
});

test('HIBP: a file written before "checked" existed is asked again once, then waits', () => {
  const first = run({ file: { updated: ago(24 * 20), items: [ROW] }, reply: [hibp('Old', ago(24))] });
  assert.equal(first.calls, 1);
  assert.equal(first.file.checked, NOW);
});

test('HIBP: a new breach moves "updated" forward', () => {
  const r = run({ file: { updated: ago(24 * 20), checked: ago(7), items: [ROW] }, reply: [hibp('New', ago(2)), hibp('Old', ago(24))] });
  assert.equal(r.file.updated, NOW);
  assert.deepEqual(r.file.items.map((i) => i.slug), ['New', 'Old']);
});

test('HIBP: an empty or unexpected reply never replaces stored breaches', () => {
  for (const reply of [[], {}, null, { error: 'rate limited' }]) {
    const stored = { updated: ago(24 * 20), checked: ago(7), items: [ROW] };
    const r = run({ file: stored, reply });
    assert.deepEqual(r.file, stored, `reply ${JSON.stringify(reply)} leaves the file as it was`);
  }
});

test('HIBP: breaches that all aged out of the 45-day window legitimately empty the list', () => {
  const r = run({ file: { updated: ago(24 * 60), checked: ago(7), items: [ROW] }, reply: [hibp('Ancient', ago(24 * 90))] });
  assert.deepEqual(r.file.items, []);
});
