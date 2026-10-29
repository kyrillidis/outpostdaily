// Builds the site from fixture data in a throw-away copy of the repo, so render tests never depend on what the live feeds said today.
// (src/render.mjs finds its data relative to its own location, so a copy of src/ + config/ reads the copy's data/.)
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));

export const item = (over = {}) => ({
  id: 'aaaaaaaaaa', section: 'cyber', source: 'Example News', weight: 0.5, title: 'Example ransomware group hits a hospital', url: 'https://example.com/a',
  snippet: 'snippet', published: '2026-10-28T09:00:00.000Z', also: [], score: 1.5, summary: 'A summary.', why: 'Check backups.', tags: ['ransomware'], ai: true, ...over,
});
export const edition = (over = {}) => ({
  date: '2026-10-28', edition: 1, compiled: '2026-10-28T10:00:00.000Z', model: 'test', items: [item()], kev: [], run_today: [], learn: [], health: [], ...over,
});

// files: { 'public/img/news/x.webp': Buffer | string } extra files to place in the copy
export function buildSite({ editions = [edition()], files = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'outpost-render-'));
  for (const d of ['src', 'config']) cpSync(join(REPO, d), join(dir, d), { recursive: true });
  cpSync(join(REPO, 'package.json'), join(dir, 'package.json'));
  cpSync(join(REPO, 'public'), join(dir, 'public'), { recursive: true, filter: (p) => !/public\/(img\/(news|dw)|archive)(\/|$)/.test(p) });
  mkdirSync(join(dir, 'data/editions'), { recursive: true });
  for (const e of editions) writeFileSync(join(dir, `data/editions/${e.date}.json`), JSON.stringify(e));
  for (const [rel, body] of Object.entries(files)) { mkdirSync(join(dir, rel, '..'), { recursive: true }); writeFileSync(join(dir, rel), body); }
  execFileSync('node', ['src/render.mjs'], { cwd: dir, stdio: 'pipe' });
  return { dir, read: (rel) => readFileSync(join(dir, 'dist', rel), 'utf8'), has: (rel) => existsSync(join(dir, 'dist', rel)), done: () => rmSync(dir, { recursive: true, force: true }) };
}
