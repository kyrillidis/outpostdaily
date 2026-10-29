// Guard rails on the Actions workflows (no YAML parser in the dependencies, so these read the text): the mistakes that already cost an outage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const wf = (n) => readFileSync(fileURLToPath(new URL(`../.github/workflows/${n}.yml`, import.meta.url)), 'utf8');
const steps = (text) => text.slice(text.indexOf('\n    steps:')).split(/\n      - /).slice(1);
const NAMES = ['daily', 'breaking'];

test('each workflow can open issues, and its alert steps say failure()/success() out loud', () => {
  for (const n of NAMES) {
    const t = wf(n);
    assert.match(t, /^permissions:\n(?:  .*\n)*  issues: write/m, `${n}: issues: write`);
    const alert = steps(t).find((s) => /alert\.sh fail/.test(s));
    assert.ok(alert, `${n}: has a failure alert step`);
    assert.match(alert, /\n        if: failure\(\)\n/, `${n}: the alert runs only after a failure (an if: with no status function silently adds success())`);
    const recover = steps(t).find((s) => /alert\.sh ok/.test(s));
    assert.ok(recover, `${n}: has a recovery step`);
    assert.match(recover, /\n        if: success\(\)/);
    assert.match(recover, /continue-on-error: true/, `${n}: a failed recovery comment must not fail a good run`);
    assert.ok(t.trimEnd().endsWith(recover.trimEnd()) || t.indexOf(recover) > t.indexOf(alert), `${n}: alert steps come last, after everything they report on`);
  }
});

test('the push retry loops abort a half-finished rebase between attempts', () => {
  for (const n of NAMES) assert.match(wf(n), /git pull --rebase -q && git push && break\n\s+git rebase --abort 2>\/dev\/null \|\| true/, n);
});

test('breaking.yml flags refused source credentials without ever failing the run', () => {
  const s = steps(wf('breaking')).find((x) => /alert\.sh creds/.test(x));
  assert.ok(s);
  assert.match(s, /continue-on-error: true/);
  assert.match(s, /if: \$\{\{ !cancelled\(\) \}\}/, 'runs even when the collector step failed');
});

test('the Vercel token is given to the Deploy step only, not to the whole job', () => {
  const t = wf('daily');
  const jobEnv = t.slice(t.indexOf('\n    env:'), t.indexOf('\n    steps:'));
  assert.ok(!/VERCEL_TOKEN/.test(jobEnv.replace(/HAS_VERCEL[^\n]*/, '')), 'no token in the job-level env');
  const holders = steps(t).filter((s) => /secrets\.VERCEL_TOKEN/.test(s));
  assert.equal(holders.length, 1);
  assert.match(holders[0], /^name: Deploy to Vercel/);
  assert.ok(!/env\.VERCEL_TOKEN/.test(t), 'no condition reads the token from the job env any more');
});
