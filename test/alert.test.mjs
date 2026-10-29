// .github/scripts/alert.sh against a fake `gh`: one issue per problem, comments at most every 6 hours, closed on recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = fileURLToPath(new URL('../.github/scripts/alert.sh', import.meta.url));
const haveTools = spawnSync('jq', ['--version']).status === 0 && spawnSync('bash', ['--version']).status === 0;
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
const issue = (number, title, createdH, commentsH = []) => ({ number, title, createdAt: ago(createdH), comments: commentsH.map((h) => ({ createdAt: ago(h) })) });

// issues: what `gh issue list` returns; returns the mutating gh calls the script made
function run(args, { issues = [], files = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'outpost-alert-'));
  try {
    writeFileSync(join(dir, 'issues.json'), JSON.stringify(issues));
    writeFileSync(join(dir, 'gh'), `#!/usr/bin/env bash
if [ "$1 $2" = "issue list" ]; then cat "$FAKE_DIR/issues.json"; exit 0; fi
echo "$*" >> "$FAKE_DIR/calls.log"`);
    chmodSync(join(dir, 'gh'), 0o755);
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(body));
    const r = spawnSync('bash', [SCRIPT, ...args.map((a) => (files[a] ? join(dir, a) : a))], { encoding: 'utf8', env: { PATH: `${dir}:${process.env.PATH}`, FAKE_DIR: dir, GITHUB_RUN_ID: '42', GITHUB_REPOSITORY: 'o/r' } });
    assert.equal(r.status, 0, r.stderr);
    const log = join(dir, 'calls.log');
    return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const T = 'Edition refresh failing';
const opts = { skip: !haveTools && 'jq or bash missing' };

test('fail: opens one issue when none is open', opts, () => {
  const calls = run(['fail', T, 'it broke'], { issues: [issue(1, 'Something else', 100)] });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^issue create --title Edition refresh failing --body it broke$/);
});

test('fail: with an issue already open it comments only once the last activity is 6 hours old', opts, () => {
  assert.deepEqual(run(['fail', T, 'again'], { issues: [issue(7, T, 30, [20, 2])] }), [], 'a comment 2 h ago: stay quiet');
  assert.deepEqual(run(['fail', T, 'again'], { issues: [issue(7, T, 1)] }), [], 'opened 1 h ago: stay quiet');
  assert.deepEqual(run(['fail', T, 'again'], { issues: [issue(7, T, 30, [20, 7])] }), ['issue comment 7 --body again'], 'last comment 7 h ago: comment');
  assert.deepEqual(run(['fail', T, 'again'], { issues: [issue(7, T, 30)] }), ['issue comment 7 --body again'], 'never commented, opened 30 h ago');
});

test('fail: an issue with a different title does not count, and a similar one is not matched by prefix', opts, () => {
  const calls = run(['fail', T, 'x'], { issues: [issue(3, T + ' (old)', 100), issue(4, 'Breaking watch failing', 100)] });
  assert.match(calls[0], /^issue create/);
});

test('ok: comments "recovered" and closes the open issue; does nothing when there is none', opts, () => {
  assert.deepEqual(run(['ok', T, 'recovered'], { issues: [issue(9, T, 5), issue(10, 'x', 5)] }), ['issue comment 9 --body recovered', 'issue close 9']);
  assert.deepEqual(run(['ok', T, 'recovered'], { issues: [] }), []);
});

const health = (...h) => ({ updated: 'x', items: [], health: h });
test('creds: every failing X group shares one issue for the provider, other 401/402/403 sources get their own', opts, () => {
  const file = health({ name: 'X cyber', ok: false, error: 'HTTP 402' }, { name: 'X crisis', ok: false, error: 'HTTP 402' }, { name: 'Some Feed', ok: false, error: 'HTTP 403' }, { name: 'Other', ok: false, error: 'HTTP 503' }, { name: 'BBC', ok: true, n: 3 });
  const calls = run(['creds', 'b.json'], { files: { 'b.json': file } });
  assert.equal(calls.length, 2);
  assert.ok(calls.some((c) => c.startsWith('issue create --title Source credential problem: X (twitterapi.io) --body') && c.includes('X cyber: HTTP 402; X crisis: HTTP 402')));
  assert.ok(calls.some((c) => c.startsWith('issue create --title Source credential problem: Some Feed --body')));
  assert.ok(!calls.some((c) => c.includes('Other') || c.includes('503')), 'a 503 is not a credential problem');
});

test('creds: an issue already open is only commented on after 6 hours; a source that no longer fails gets its issue closed', opts, () => {
  const file = health({ name: 'X cyber', ok: false, error: 'HTTP 402' });
  const t = 'Source credential problem: X (twitterapi.io)';
  assert.deepEqual(run(['creds', 'b.json'], { files: { 'b.json': file }, issues: [issue(5, t, 50, [1])] }), []);
  assert.equal(run(['creds', 'b.json'], { files: { 'b.json': file }, issues: [issue(5, t, 50, [8])] })[0], 'issue comment 5 --body ' + 'The last collection run was refused: X cyber: HTTP 402. This usually means an expired key, a revoked token or an unpaid plan; the source returns nothing until it is fixed. Run: https://github.com/o/r/actions/runs/42');
  const healthy = health({ name: 'X cyber', ok: true, n: 1 });
  const closed = run(['creds', 'b.json'], { files: { 'b.json': healthy }, issues: [issue(5, t, 50), issue(6, 'Unrelated', 5)] });
  assert.equal(closed.length, 2);
  assert.match(closed[0], /^issue comment 5 --body Recovered/);
  assert.equal(closed[1], 'issue close 5');
});

test('creds: a missing or empty health list is quietly fine', opts, () => {
  assert.deepEqual(run(['creds', 'nope.json']), []);
  assert.deepEqual(run(['creds', 'b.json'], { files: { 'b.json': { items: [] } } }), []);
});
