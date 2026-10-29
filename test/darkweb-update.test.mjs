// updateDarkweb (src/darkweb.mjs) against a throw-away copy of the repo: which claims go to the model, and what is stored when it fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const NOW = '2026-10-29T12:00:00.000Z';
const ago = (h) => new Date(Date.parse(NOW) - h * 36e5).toISOString();
const post = (n, h) => ({ id: 'x' + n, kind: 'x', group: 'darkweb', source: '@someone', title: `Ransomware group claims a data breach at company number ${n}`, url: `https://x.com/s/status/${n}`, published: ago(h) });
const stored = (n, h) => ({ id: 'x' + n, kind: 'x', source: '@someone', url: `https://x.com/s/status/${n}`, published: ago(h), headline: `Group claims company ${n}`, claim: 'c', context: 'ctx', advice: ['a', 'b'], verified: false });

// mode: 'ok' answers every id, 'null' fails like an API outage, 'skip' answers with an empty list
function run({ breaking, store, mode = 'ok' }) {
  const dir = mkdtempSync(join(tmpdir(), 'outpost-dw-'));
  try {
    cpSync(join(REPO, 'src'), join(dir, 'src'), { recursive: true });
    cpSync(join(REPO, 'config'), join(dir, 'config'), { recursive: true });
    mkdirSync(join(dir, 'data'));
    symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
    writeFileSync(join(dir, 'data/breaking.json'), JSON.stringify({ updated: NOW, items: breaking }));
    if (store) writeFileSync(join(dir, 'data/darkweb.json'), JSON.stringify(store));
    writeFileSync(join(dir, 'driver.mjs'), `import { updateDarkweb } from './src/darkweb.mjs';
const sent = [];
const call = async (list) => { sent.push(...list.map((i) => i.id)); const mode = ${JSON.stringify(mode)};
  if (mode === 'null') return null;
  if (mode === 'skip') return { items: [] };
  return { items: list.map((i) => ({ id: i.id, headline: 'Group claims ' + i.id, claim: 'A claim.', context: 'General background.', advice: ['one', 'two'] })) }; };
await updateDarkweb({ now: new Date(${JSON.stringify(NOW)}), call });
console.log('SENT ' + JSON.stringify(sent));`);
    const out = execFileSync('node', ['driver.mjs'], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, DW_IMAGES: 'off' } });
    return { sent: JSON.parse(out.match(/SENT (.*)/)[1]), file: JSON.parse(readFileSync(join(dir, 'data/darkweb.json'), 'utf8')) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('claims older than the oldest one on a full page never reach the model', () => {
  const full = Array.from({ length: 40 }, (_, n) => stored(n + 100, n + 1)); // 1h ... 40h old
  const { sent, file } = run({ store: { updated: ago(1), items: full }, breaking: [post(1, 0.5), post(2, 60), post(3, 50)] });
  assert.deepEqual(sent, ['x1'], 'only the post newer than the oldest kept claim is sent');
  assert.equal(file.items.length, 40);
  assert.ok(file.items.some((i) => i.id === 'x1'));
});

test('while the page has room, an older claim is still written up', () => {
  const { sent, file } = run({ store: { updated: ago(1), items: [stored(100, 1)] }, breaking: [post(2, 60)] });
  assert.deepEqual(sent, ['x2']);
  assert.equal(file.items.find((i) => i.id === 'x2').headline, 'Group claims x2');
});

test('when the AI call fails nothing is stored, so the posts are offered again next run', () => {
  const failed = run({ store: { updated: ago(1), items: [stored(100, 1)] }, breaking: [post(2, 2), post(3, 3)], mode: 'null' });
  assert.deepEqual(failed.file.items.map((i) => i.id), ['x100'], 'no raw tweet is stored as a headline');
  const retried = run({ store: failed.file, breaking: [post(2, 2), post(3, 3)] });
  assert.deepEqual(retried.sent.sort(), ['x2', 'x3'], 'the next run asks again');
  assert.ok(retried.file.items.every((i) => i.id === 'x100' || i.context === 'General background.'), 'and stores the real write-ups');
});

test('a post the model keeps skipping is shown as written after a few tries, not asked about forever', () => {
  let state = { updated: ago(1), items: [stored(100, 1)] };
  const seen = [];
  for (let n = 0; n < 3; n++) {
    const r = run({ store: state, breaking: [post(2, 2)], mode: 'skip' });
    seen.push(r.sent.length); state = r.file;
    if (n < 2) assert.ok(!state.items.some((i) => i.id === 'x2'), `try ${n + 1}: not stored yet`);
  }
  assert.deepEqual(seen, [1, 1, 1]);
  assert.ok(state.items.some((i) => i.id === 'x2'), 'after the third try it is stored with its own words');
  assert.equal(state.tries, undefined, 'and the counter is gone');
  assert.deepEqual(run({ store: state, breaking: [post(2, 2)], mode: 'skip' }).sent, [], 'known now, never sent again');
});
