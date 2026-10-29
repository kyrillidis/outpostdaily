// Build-time behaviour of src/render.mjs on fixture data: text written by outside publishers must never break or fail the build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { buildSite, edition, item } from './render-fixture.mjs';

const attr = (html, re) => html.match(re)?.[1] ?? '';
const desc = (html) => attr(html, /<meta name="description" content="([^"]*)">/);

test('a headline full of characters that grow when escaped still gives a description within the 170-character limit', () => {
  const nasty = '"Quote" & <b>AT&T</b> "x" & "y" & "z" & "q" ' .repeat(4);
  const site = buildSite({ editions: [edition({ items: ['cyber', 'warfare', 'geo'].map((section, n) => item({ id: 'b' + n, section, title: nasty + n, url: 'https://example.com/' + n })) })] });
  try {
    for (const page of ['index.html', 'cyber/index.html', 'warfare/index.html', 'geopolitics/index.html', 'today/index.html', 'archive/2026-10-28.html']) {
      const d = desc(site.read(page));
      assert.ok(d.length >= 50 && d.length <= 170, `${page}: escaped description is ${d.length}`);
    }
  } finally { site.done(); }
});

test('an ordinary headline keeps its description exactly as before (no extra trimming)', () => {
  const site = buildSite();
  try { assert.match(desc(site.read('cyber/index.html')), /Example ransomware group hits a hospital\. Breaches, campaigns and advisories, linked to source\.$/); } finally { site.done(); }
});

test('an out-of-range numeric entity in a headline does not crash the build', () => {
  const site = buildSite({ editions: [edition({ items: [item({ title: 'Broken &#x110000; entity &#1114112; and &#xD800; here' })] })] });
  try { assert.match(site.read('cyber/index.html'), /Broken\s+entity\s+and\s+here/); } finally { site.done(); }
});
