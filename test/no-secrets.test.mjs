import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The repo is public: fail CI if anything shaped like an API key is ever committed.
test('no API keys in tracked files', () => {
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  const hits = files.filter((f) => /sk-(proj-)?[A-Za-z0-9_-]{32,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});
