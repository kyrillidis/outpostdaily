import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// The repo is public: fail CI if anything shaped like an API key or token is ever committed.
// sk- keys are mixed case with digits; requiring both skips lowercase URL slugs like /story/sk-hynix-…
const SK = /(?<![A-Za-z0-9_-])sk-(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*\d)(proj-)?[A-Za-z0-9_-]{32,}/;
const GENERIC = /(?<![A-Za-z0-9_-])vcp_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}/;
const AKIA = /AKIA[0-9A-Z]{16}/;

// data/ holds text written by outside publishers (feeds, posts, breach descriptions) and is committed by a job that runs no tests,
// while the daily job runs this test before it fetches: one innocent line there would block every deploy. So under data/ a URL and a
// documentation example key (the AWS docs one, ending in EXAMPLE) are not secrets, and the generic GitHub/Vercel token rules do not apply (this
// project holds no such token in data; the OpenAI sk- rule and the AWS rule still do). Every other tracked file gets the full scan.
export function leaksSecret(file, text) {
  if (!file.startsWith('data/')) return [SK, GENERIC, AKIA].some((r) => r.test(text));
  const own = text.replace(/https?:\/\/\S+/g, ' ').replace(/[A-Za-z0-9_-]*EXAMPLE[A-Za-z0-9_-]*/g, ' ');
  return [SK, AKIA].some((r) => r.test(own));
}

test('no API keys or tokens in tracked files', () => {
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && existsSync(f));
  assert.deepEqual(files.filter((f) => leaksSecret(f, readFileSync(f, 'latin1'))), []);
});

// fixtures are assembled at run time so this file does not trip its own scan
const KEY = 'sk-' + 'proj-Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789abcd', AWS_EXAMPLE = 'AKIA' + 'IOSFODNN7EXAMPLE', AWS_REAL = 'AKIA' + 'QWERTYUIOP123456';
const GHP = 'ghp' + '_abcdefghijklmnopqrstuvwxyz0123456789', GHO = 'gho' + '_abcdefghijklmnopqrstuvwxyz0123456789', VCP = 'vcp' + '_abcdefghijklmnopqrstuvwxyz01234567';

test('the secret scan never lets third-party text under data/ fail the gate', () => {
  assert.equal(leaksSecret('data/breaking.json', `"title":"AWS docs use ${AWS_EXAMPLE} as a sample key"`), false);
  assert.equal(leaksSecret('data/breaking.json', `"url":"https://example.com/story/${KEY}"`), false);
  assert.equal(leaksSecret('data/darkweb.json', `"title":"leak of ${GHP} tokens"`), false);
  assert.equal(leaksSecret('data/editions/x.json', `"title":"${VCP}"`), false);
});

test('the secret scan stays strict everywhere else, and for real keys under data/', () => {
  for (const f of ['src/x.mjs', 'README.md', '.github/workflows/a.yml']) {
    assert.equal(leaksSecret(f, KEY), true, f);
    assert.equal(leaksSecret(f, GHP), true, f);
    assert.equal(leaksSecret(f, GHO), true, f);
    assert.equal(leaksSecret(f, VCP), true, f);
    assert.equal(leaksSecret(f, AWS_EXAMPLE), true, f);
  }
  assert.equal(leaksSecret('data/cache.json', `"x":"${KEY}"`), true);
  assert.equal(leaksSecret('data/cache.json', `"x":"${AWS_REAL}"`), true);
});
