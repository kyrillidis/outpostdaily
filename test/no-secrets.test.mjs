import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// The repo is public: fail CI if anything shaped like an API key or token is ever committed.
test('no API keys or tokens in tracked files', () => {
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && existsSync(f));
  const secret = /sk-(proj-)?[A-Za-z0-9_-]{32,}|vcp_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}/;
  assert.deepEqual(files.filter((f) => secret.test(readFileSync(f, 'latin1'))), []);
});
