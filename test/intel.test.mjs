// Unit tests for src/intel.mjs, the open-data parsers behind the Dark web page:
//   parseRansomLook   RansomLook /api/posts JSON    -> leak-site listings (claims, not confirmed incidents)
//   pickBreaches      Have I Been Pwned breach list -> recent confirmed breaches
// updateIntel() does network and file I/O and is deliberately never called. fetch is replaced before the module
// loads, so an accidental request fails loudly instead of reaching the network. All dates are passed in explicitly.
//
// Tests named "BUG: ..." pin real defects found in the source. They carry KNOWN_BUG ({ todo }) so they keep running
// and stay visible in the output without failing `npm test` (daily.yml runs it before every edition deploy).
// Fix the source, then delete the KNOWN_BUG argument and the test becomes an ordinary regression test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

globalThis.fetch = () => { throw new Error('the network is off in unit tests'); };
const { parseRansomLook, pickBreaches } = await import('../src/intel.mjs');

const KNOWN_BUG = {}; // no open bugs: tests named 'BUG: ...' are ordinary regression tests
const sha10 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);

// ===================================================================================== parseRansomLook

// RansomLook returns { posts: [{ group_name, post_title, discovered }] }
const post = (group_name, post_title, discovered = '2026-10-25T17:24:54.684Z') => ({ group_name, post_title, discovered });
const parse = (...posts) => parseRansomLook({ posts });
const one = (...args) => parse(post(...args));

describe('parseRansomLook', () => {
  test('turns RansomLook posts into correctly shaped listings', () => {
    assert.deepEqual(parse(post('qilin', 'White & Case', '2026-10-25T17:24:54.684Z'), post('panzer', 'Yodingenierie', '2026-10-25T18:19:56.848Z')), [
      { id: '9618eefae2', group: 'Qilin', victim: 'White & Case', country: '', published: '2026-10-25T17:24:54.684Z', url: 'https://www.ransomlook.io/group/qilin' },
      { id: 'b4b255d3ab', group: 'PANZER', victim: 'Yodingenierie', country: '', published: '2026-10-25T18:19:56.848Z', url: 'https://www.ransomlook.io/group/panzer' },
    ]);
  });

  test('keeps the order of the posts instead of sorting', () => {
    assert.deepEqual(parse(post('akira', 'B Corp'), post('qilin', 'A Corp')).map((r) => r.victim), ['B Corp', 'A Corp']);
  });

  test('country is always empty (RansomLook does not give one)', () => {
    assert.equal(one('qilin', 'White & Case').at(0).country, '');
  });

  describe('group names', () => {
    const GROUPS = [
      ['a known group in lower case gets its canonical spelling', 'qilin', 'Qilin'],
      ['a known group in upper case gets its canonical spelling', 'LOCKBIT', 'LockBit'],
      ['a known camel-case group is restored', 'whitearmor', 'WhiteArmor'],
      ['an all-caps group is restored', 'panzer', 'PANZER'],
      ['a multi-word known group is restored', 'inc ransom', 'INC Ransom'],
      ['an unknown slug gets a capital first letter', 'nightspire', 'Nightspire'],
      ['an unknown multi-word slug only has its first letter capitalised', 'space bears', 'Space bears'],
      ['an unknown slug with digits', 'lockbit5', 'Lockbit5'],
      ['surrounding whitespace is trimmed', '  Qilin  ', 'Qilin'],
    ];
    for (const [name, slug, want] of GROUPS) test(name, () => assert.equal(one(slug, 'Acme')[0].group, want));

    test('the url points at the group page and URL-encodes the slug', () => {
      assert.equal(one('qilin', 'Acme')[0].url, 'https://www.ransomlook.io/group/qilin');
      assert.equal(one('space bears', 'Acme')[0].url, 'https://www.ransomlook.io/group/space%20bears');
      assert.equal(one('odd/slug?x', 'Acme')[0].url, 'https://www.ransomlook.io/group/odd%2Fslug%3Fx');
    });
  });

  describe('victim names', () => {
    const VICTIMS = [
      ['decodes named entities', 'White &amp; Case', 'White & Case'],
      ['decodes numeric entities', 'Caf&#233; Cr&#x00E8;me &#8211; GmbH', 'Café Crème – GmbH'],
      ['decodes entities once, so a double-escaped name keeps one level of escaping', 'AT&amp;amp;T Labs', 'AT&amp;T Labs'],
      ['collapses newlines and runs of spaces', '  Spaced \n  Name\t Ltd ', 'Spaced Name Ltd'],
      ['keeps ampersands, commas and masked names as they are', 'Newcomer Cremations, Funerals & Receptions', 'Newcomer Cremations, Funerals & Receptions'],
      ['keeps a masked domain', 'tek****om.pl', 'tek****om.pl'],
      ['keeps an out-of-range numeric entity as text instead of throwing', 'Boom &#9999999999; Inc', 'Boom &#9999999999; Inc'],
    ];
    for (const [name, title, want] of VICTIMS) test(name, () => assert.equal(one('qilin', title)[0].victim, want));

    test('caps a very long name at 140 characters', () => assert.equal(one('qilin', 'A'.repeat(300))[0].victim.length, 140));
    test('accepts a two-character name', () => assert.equal(one('qilin', 'AB').length, 1));
  });

  describe('skips posts that are not victims', () => {
    const TITLES = [
      ['a plain http link', 'http://example.com/leak'],
      ['an https link', 'https://example.com/leak'],
      ['a link with mixed-case scheme', 'HTTPS://Example.com'],
      ['a text that mentions a link', 'Visit https://example.com for details'],
      ['an onion address', 'abcdefghijklmnop.onion'],
      ['an upper-case onion address', 'ABCDEFGHIJKLMNOP.ONION/blog'],
      ['a www address', 'www.example.com'],
      ['an upper-case WWW address', 'WWW.EXAMPLE.COM'],
      ['a one-character title', 'A'],
      ['an empty title', ''],
      ['a whitespace-only title', '   '],
      ['a title that is only a decoded space', '&nbsp;'],
    ];
    for (const [name, title] of TITLES) test(`skips ${name}`, () => assert.deepEqual(one('qilin', title), []));
    test('skips a post with no title field', () => assert.deepEqual(parse({ group_name: 'qilin', discovered: '2026-10-25T17:24:54.684Z' }), []));
    test('keeps a name that merely contains "ww" or "http" without the link syntax', () => assert.equal(one('qilin', 'Awwwesome http Holdings').length, 1));
  });

  describe('skips posts without a usable group or date', () => {
    for (const [name, group] of [['a missing group', undefined], ['an empty group', ''], ['a blank group', '   '], ['a null group', null]]) {
      test(`skips ${name}`, () => assert.deepEqual(one(group, 'Acme'), []));
    }
    for (const [name, date] of [['an unreadable date', 'not a date'], ['an empty date', '']]) {
      test(`skips ${name}`, () => assert.deepEqual(one('qilin', 'Acme', date), []));
    }
    test('skips a post with no date field', () => assert.deepEqual(parse({ group_name: 'qilin', post_title: 'Acme' }), []));
  });

  describe('dates', () => {
    const DATES = [
      ['an ISO UTC time with milliseconds', '2026-10-25T17:24:54.684Z', '2026-10-25T17:24:54.684Z'],
      ['an ISO UTC time without milliseconds', '2026-10-25T17:24:54Z', '2026-10-25T17:24:54.000Z'],
      ['microsecond precision (truncated to milliseconds)', '2026-10-25T17:24:54.684123Z', '2026-10-25T17:24:54.684Z'],
      ['a +02:00 offset, converted to UTC', '2026-10-25T19:24:54+02:00', '2026-10-25T17:24:54.000Z'],
    ];
    for (const [name, date, want] of DATES) test(`reads ${name}`, () => assert.equal(one('qilin', 'Acme', date)[0].published, want));
    test('published is always an ISO string', () => assert.match(one('qilin', 'Acme')[0].published, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/));
  });

  describe('ids', () => {
    test('are the first 10 hex characters of the SHA-1 of "slug|victim|ISO time"', () => {
      assert.equal(one('qilin', 'White & Case', '2026-10-25T17:24:54.684Z')[0].id, sha10('qilin|White & Case|2026-10-25T17:24:54.684Z'));
      assert.match(one('qilin', 'Acme')[0].id, /^[0-9a-f]{10}$/);
    });

    test('are stable: the same ids that data/ransomware.json already stores for these posts', () => {
      assert.equal(one('qilin', 'White & Case', '2026-10-25T17:24:54.684Z')[0].id, '9618eefae2');
      assert.equal(one('panzer', 'Yodingenierie', '2026-10-25T18:19:56.848Z')[0].id, 'b4b255d3ab');
    });

    test('are the same on every parse, and for the same post written with a different date format', () => {
      assert.deepEqual(one('qilin', 'Acme'), one('qilin', 'Acme'));
      assert.equal(one('qilin', 'Acme', '2026-10-25T17:24:54Z')[0].id, one('qilin', 'Acme', '2026-10-25T19:24:54+02:00')[0].id);
    });

    test('differ when the group, the victim or the time differs', () => {
      const base = one('qilin', 'Acme')[0].id;
      assert.notEqual(base, one('akira', 'Acme')[0].id);
      assert.notEqual(base, one('qilin', 'Acme Two')[0].id);
      assert.notEqual(base, one('qilin', 'Acme', '2026-10-25T17:24:55.684Z')[0].id);
    });

    test('are identical for a post that appears twice, so the daily merge can de-duplicate it', () => {
      const [a, b] = parse(post('qilin', 'Acme'), post('qilin', 'Acme'));
      assert.equal(a.id, b.id);
    });
  });

  describe('odd payloads', () => {
    test('anything that is not { posts: [...] } gives an empty list instead of throwing', () => {
      for (const bad of [null, undefined, {}, { posts: null }, { posts: 'x' }, { posts: {} }, [], 'text', 5]) assert.deepEqual(parseRansomLook(bad), []);
    });
    test('null and non-object entries inside posts are skipped', () => {
      assert.deepEqual(parseRansomLook({ posts: [null, undefined, 5, 'x', {}, { group_name: 'qilin' }] }), []);
      assert.deepEqual(parseRansomLook({ posts: [null, post('qilin', 'Acme'), 7] }).map((r) => r.victim), ['Acme']);
    });
    test('a bad post does not stop the good ones around it', () => {
      assert.deepEqual(parse(post('qilin', 'First Corp'), post('qilin', 'https://example.com'), post('', 'No Group'), post('akira', 'Last Corp')).map((r) => r.victim), ['First Corp', 'Last Corp']);
    });
    test('an empty posts list gives an empty list', () => assert.deepEqual(parse(), []));
    test('does not mutate the payload', () => {
      const payload = { posts: [post('qilin', 'White &amp; Case'), post('akira', 'https://x.example')] };
      const before = JSON.stringify(payload);
      parseRansomLook(payload);
      assert.equal(JSON.stringify(payload), before);
    });
  });

  test('BUG: a post with a null date is accepted as 1970-01-01 (new Date(null) is the epoch, not an invalid date)', KNOWN_BUG, () => {
    assert.deepEqual(one('qilin', 'Acme', null), []);
    assert.deepEqual(one('qilin', 'Acme', 0), []);
  });
});

// ===================================================================================== pickBreaches

const NOW = Date.parse('2026-10-25T12:00:00Z');
// HIBP style timestamps, e.g. 2026-10-20T02:29:36Z
const daysAgo = (d) => new Date(NOW - d * 864e5).toISOString().replace(/\.\d{3}Z$/, 'Z');
const breach = (name, ago, o = {}) => ({
  Name: name, Title: `${name} Title`, Domain: `${name.toLowerCase()}.example`, BreachDate: '2026-01-15', AddedDate: daysAgo(ago), ModifiedDate: daysAgo(ago), PwnCount: 1234,
  Description: 'A breach.', LogoPath: 'https://haveibeenpwned.com/Content/Images/PwnedLogos/x.png', DataClasses: ['Email addresses', 'Passwords'],
  IsVerified: true, IsFabricated: false, IsSensitive: false, IsRetired: false, IsSpamList: false, IsMalware: false, IsSubscriptionFree: false, IsStealerLog: false, ...o,
});
const slugs = (list, now = NOW) => pickBreaches(list, now).map((b) => b.slug);
const describe1 = (description) => pickBreaches([breach('D', 1, { Description: description })], NOW)[0].description;

describe('pickBreaches', () => {
  test('maps a HIBP record to the shape the Dark web page uses', () => {
    const [b] = pickBreaches([breach('Crunchbase', 11, { Title: 'Crunchbase', Domain: 'crunchbase.com', BreachDate: '2026-01-26', PwnCount: 559908, DataClasses: ['Email addresses', 'Names'], Description: 'In January 2026, Crunchbase was targeted in an extortion attempt.' })], NOW);
    assert.deepEqual(b, {
      name: 'Crunchbase', slug: 'Crunchbase', domain: 'crunchbase.com', breachDate: '2026-01-26', addedDate: daysAgo(11), count: 559908, classes: ['Email addresses', 'Names'], verified: true,
      description: 'In January 2026, Crunchbase was targeted in an extortion attempt.', url: 'https://haveibeenpwned.com/Breach/Crunchbase',
    });
  });

  test('uses Title as the display name and falls back to Name', () => {
    assert.equal(pickBreaches([breach('GitesDeFrance', 1, { Title: 'Gîtes de France' })], NOW)[0].name, 'Gîtes de France');
    assert.equal(pickBreaches([breach('GitesDeFrance', 1, { Title: '' })], NOW)[0].name, 'GitesDeFrance');
    assert.equal(pickBreaches([breach('GitesDeFrance', 1, { Title: undefined })], NOW)[0].name, 'GitesDeFrance');
  });

  test('fills sensible defaults for missing optional fields', () => {
    const [b] = pickBreaches([breach('Sparse', 1, { Domain: '', PwnCount: undefined, IsVerified: undefined, DataClasses: undefined, Description: undefined })], NOW);
    assert.equal(b.domain, '');
    assert.equal(b.count, 0);
    assert.equal(b.verified, false);
    assert.deepEqual(b.classes, []);
    assert.equal(b.description, '');
  });

  describe('exclusions', () => {
    for (const flag of ['IsFabricated', 'IsSpamList', 'IsStealerLog', 'IsSensitive', 'IsRetired']) {
      test(`drops entries flagged ${flag}`, () => assert.deepEqual(slugs([breach('Flagged', 1, { [flag]: true }), breach('Fine', 2)]), ['Fine']));
    }
    test('keeps an entry with every flag false', () => assert.deepEqual(slugs([breach('Fine', 1)]), ['Fine']));
    test('keeps an entry that has none of the flags at all', () => {
      const bare = breach('Bare', 1);
      for (const flag of ['IsFabricated', 'IsSpamList', 'IsStealerLog', 'IsSensitive', 'IsRetired']) delete bare[flag];
      assert.deepEqual(slugs([bare]), ['Bare']);
    });
    test('a malware or subscription-free flag does not exclude an entry', () => {
      assert.deepEqual(slugs([breach('M', 1, { IsMalware: true }), breach('S', 2, { IsSubscriptionFree: true })]), ['M', 'S']);
    });
  });

  describe('age', () => {
    test('keeps entries added within 45 days and drops older ones', () => {
      assert.deepEqual(slugs([breach('Today', 0.1), breach('D30', 30), breach('D44', 44.5), breach('D45half', 45.5), breach('D46', 46), breach('D200', 200)]), ['Today', 'D30', 'D44']);
    });
    test('is measured from the `now` argument', () => {
      const list = [breach('A', 1), breach('B', 10)];
      assert.deepEqual(slugs(list, NOW), ['A', 'B']);
      assert.deepEqual(slugs(list, NOW + 40 * 864e5), ['A'], 'after 40 more days only the fresher entry is still under 45 days old');
      assert.deepEqual(slugs(list, NOW + 100 * 864e5), []);
    });
    test('accepts `now` as a Date', () => assert.deepEqual(slugs([breach('A', 1)], new Date(NOW)), ['A']));
    test('defaults `now` to the current clock', () => {
      const live = (days) => new Date(Date.now() - days * 864e5).toISOString().replace(/\.\d{3}Z$/, 'Z');
      assert.deepEqual(pickBreaches([breach('Recent', 0, { AddedDate: live(0.05) }), breach('Ancient', 0, { AddedDate: live(90) })]).map((b) => b.slug), ['Recent']);
    });
    test('drops entries with a missing or unreadable AddedDate', () => {
      assert.deepEqual(slugs([breach('NoDate', 1, { AddedDate: undefined }), breach('Junk', 1, { AddedDate: 'garbage' }), breach('Null', 1, { AddedDate: null }), breach('Ok', 1)]), ['Ok']);
    });
  });

  describe('order and cap', () => {
    test('sorts by AddedDate, newest first, whatever order the list arrives in', () => {
      const list = [breach('Old', 20), breach('New', 1), breach('Mid', 8), breach('Newest', 0.5)];
      assert.deepEqual(slugs(list), ['Newest', 'New', 'Mid', 'Old']);
      assert.deepEqual(slugs([...list].reverse()), ['Newest', 'New', 'Mid', 'Old']);
    });

    test('keeps at most 30 and they are the newest 30', () => {
      const list = Array.from({ length: 45 }, (_, i) => breach(`B${String(i).padStart(2, '0')}`, 0.2 + i * 0.5));
      const out = slugs([...list].reverse());
      assert.equal(out.length, 30);
      assert.deepEqual(out, list.slice(0, 30).map((b) => b.Name));
    });

    test('returns fewer than 30 when fewer qualify', () => {
      assert.equal(pickBreaches(Array.from({ length: 12 }, (_, i) => breach(`B${i}`, i + 1)), NOW).length, 12);
    });
  });

  describe('description', () => {
    test('strips HTML tags and decodes entities', () => {
      assert.equal(describe1('The <b>Acme</b> breach &amp; the &quot;Beta&quot; leak <a href="https://x.example/a?b=1&amp;c=2" target="_blank" rel="noopener">details</a> were reported'), 'The Acme breach & the "Beta" leak details were reported');
    });

    test('collapses newlines and runs of whitespace', () => assert.equal(describe1('Line one\n\n  line   two\ttab'), 'Line one line two tab'));

    test('leaves a short description unchanged', () => assert.equal(describe1('Short and sweet. Two sentences.'), 'Short and sweet. Two sentences.'));

    const S1 = 'In August 2026, Acme Corp suffered a data breach that exposed customer records.';
    const S2 = 'The attackers later published the data on a popular hacking forum, along with a ransom demand.';
    const S3 = 'Acme said it had notified regulators and affected customers, and had hired an outside forensic firm to review the incident in full detail.';

    test('shortens a long description to at most 240 characters, ending at a sentence end', () => {
      const out = describe1(`${S1} ${S2} ${S3}`);
      assert.equal(out, `${S1} ${S2}`);
      assert.ok(out.length <= 240);
      assert.ok(out.endsWith('.'));
    });

    test('also ends at ! or ? when that is the last sentence end that fits', () => {
      const out = describe1(`${S1.replace(/\.$/, '!')} ${S2.replace(/\.$/, '?')} ${S3}`);
      assert.equal(out, `${S1.replace(/\.$/, '!')} ${S2.replace(/\.$/, '?')}`);
    });

    test('with no sentence end in reach it cuts at a word and adds an ellipsis', () => {
      const text = 'In August 2026 a large number of customers of a regional service provider discovered that their account details had been copied by attackers who then offered them for sale on several underground forums while the company continued to investigate how the intruders obtained access to its internal systems and for how long they had remained undetected inside the network';
      const out = describe1(text);
      assert.ok(out.length <= 240, `${out.length} chars`);
      assert.ok(out.endsWith('…'));
      const body = out.slice(0, -1);
      assert.ok(text.startsWith(body));
      assert.equal(text[body.length], ' ', 'the cut falls on a word boundary');
    });

    test('an unbroken 500-character token is still cut to the limit', () => {
      const out = describe1('x'.repeat(500));
      assert.ok(out.length <= 240);
      assert.ok(out.endsWith('…'));
    });

    test('strips HTML before measuring, so markup does not eat the budget', () => {
      const markup = `<p><a href="https://example.com/${'long/'.repeat(40)}">${S1}</a></p>`;
      assert.equal(describe1(markup), S1);
    });

    test('a realistic HIBP description with a link stays intact when it fits', () => {
      const raw = 'In September 2024, the French national pension fund <a href="https://example.com/news" target="_blank" rel="noopener">Assurance Retraite</a> suffered a data breach affecting approximately 370k assistance beneficiaries. The data was later posted to a popular hacking forum.';
      assert.equal(describe1(raw), 'In September 2024, the French national pension fund Assurance Retraite suffered a data breach affecting approximately 370k assistance beneficiaries. The data was later posted to a popular hacking forum.');
    });
  });

  describe('links and classes', () => {
    test('builds the HIBP breach url from the Name, not the Title', () => {
      assert.equal(pickBreaches([breach('AngelOne', 1, { Title: 'Angel One' })], NOW)[0].url, 'https://haveibeenpwned.com/Breach/AngelOne');
    });
    test('URL-encodes names that contain special characters', () => {
      assert.equal(pickBreaches([breach('Odd Name/with?chars&more#hash', 1)], NOW)[0].url, 'https://haveibeenpwned.com/Breach/Odd%20Name%2Fwith%3Fchars%26more%23hash');
      assert.equal(pickBreaches([breach('Gîtes de France', 1)], NOW)[0].url, 'https://haveibeenpwned.com/Breach/G%C3%AEtes%20de%20France');
    });
    test('keeps at most 8 data classes, in their original order', () => {
      const DataClasses = Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`);
      assert.deepEqual(pickBreaches([breach('C', 1, { DataClasses })], NOW)[0].classes, DataClasses.slice(0, 8));
    });
    test('keeps fewer than 8 data classes untouched', () => {
      assert.deepEqual(pickBreaches([breach('C', 1, { DataClasses: ['Passwords'] })], NOW)[0].classes, ['Passwords']);
    });
  });

  describe('robustness', () => {
    test('anything that is not an array gives an empty list', () => {
      for (const bad of [null, undefined, {}, 'breaches', 42]) assert.deepEqual(pickBreaches(bad, NOW), []);
    });
    test('ignores null and non-object entries in the list', () => assert.deepEqual(slugs([null, undefined, breach('Ok', 1), 5, 'x', false]), ['Ok']));
    test('does not mutate the input list or its entries', () => {
      const list = [breach('B', 5, { Description: '<b>x</b>' }), breach('A', 1)];
      const before = JSON.stringify(list);
      pickBreaches(list, NOW);
      assert.equal(JSON.stringify(list), before);
    });
    test('an empty list gives an empty list', () => assert.deepEqual(pickBreaches([], NOW), []));
  });

  describe('known bugs', () => {
    test('BUG: stripping a tag leaves a space before the punctuation that follows it ("beneficiaries ." ships in data/breaches.json)', KNOWN_BUG, () => {
      assert.equal(describe1('Data on <a href="https://x.example/report">370k beneficiaries</a>. More text follows here.'), 'Data on 370k beneficiaries. More text follows here.');
      assert.equal(describe1('Data on <a href="https://x.example">370k users</a>, mostly in <b>France</b>; also <i>Spain</i>!'), 'Data on 370k users, mostly in France; also Spain!');
    });

    test('BUG: the stray space survives shortening too (a long description cut at a sentence that ends in a link)', KNOWN_BUG, () => {
      const first = 'In August 2026, an extortion campaign by a well known group of attackers targeted the platform <a href="https://example.com/x">Chess.com</a>.';
      const out = describe1(`${first} ${'The group later published data it claimed had been obtained from the company and its partners. '.repeat(4)}`);
      assert.ok(out.length <= 240);
      assert.doesNotMatch(out, /\s[.,;:!?]/);
    });
  });
});
