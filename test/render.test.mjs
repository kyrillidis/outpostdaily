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

test('a headline containing the CDATA terminator keeps feed.xml well formed', () => {
  const site = buildSite({ editions: [edition({ items: [item({ title: 'Parser bug on ]]> sequences', summary: 'The text ]]> appears in the summary', why: 'Check ]]> handling' })] })] });
  try {
    const feed = site.read('feed.xml');
    assert.equal(XMLValidator.validate(feed), true, 'feed.xml is well-formed XML');
    const it = new XMLParser().parse(feed).rss.channel.item;
    assert.equal(it.title, 'Parser bug on ]]> sequences', 'the title round-trips unchanged');
    assert.match(it.description, /The text \]\]&gt; appears in the summary/);
    assert.match(it.description, /Check \]\]&gt; handling/);
  } finally { site.done(); }
});

test('a story whose picture file no longer exists renders no broken <img>', () => {
  const gone = item({ id: 'cccccccccc', image: '/img/news/cccccccccc.webp' });
  const here = item({ id: 'dddddddddd', url: 'https://example.com/d', title: 'Other story', image: '/img/news/dddddddddd.webp' });
  const site = buildSite({ editions: [edition({ items: [gone, here] })], files: { 'public/img/news/dddddddddd.webp': 'x' } });
  try {
    const html = site.read('cyber/index.html');
    assert.ok(!html.includes('/img/news/cccccccccc.webp'), 'the deleted picture is not referenced');
    assert.ok(html.includes('/img/news/dddddddddd.webp'), 'a picture that exists is still shown');
    assert.ok(!site.read('archive/2026-10-28.html').includes('/img/news/cccccccccc.webp'));
  } finally { site.done(); }
});

test('an old edition keeps showing a picture that is still on disk even when its JSON predates it', () => {
  const site = buildSite({ editions: [edition({ items: [item({ id: 'eeeeeeeeee' })] })], files: { 'public/img/news/eeeeeeeeee.webp': 'x' } });
  try { assert.ok(site.read('cyber/index.html').includes('/img/news/eeeeeeeeee.webp')); } finally { site.done(); }
});
