// Unit tests for src/lib/feed.mjs, the pure helpers behind the Breaking and Dark web pages.
// Offline and deterministic: every fixture is a string copied from the live feeds (data/breaking.json,
// data/darkweb.json) or a small variation of one, inlined here so the tests never read data or config files.
//
// Tests named "BUG: ..." pin real defects found in the source. They carry KNOWN_BUG ({ todo }) so they keep running
// and stay visible in the output without failing `npm test` (daily.yml runs it before every edition deploy).
// Fix the source, then delete the KNOWN_BUG argument and the test becomes an ordinary regression test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, cleanText, headlineOf, topicsOf, normalizeBreaking, topNow, classifyClaim, CATEGORIES, GROUP_LABEL, KIND_LABEL, RANSOM_GROUPS } from '../src/lib/feed.mjs';

const KNOWN_BUG = {}; // no open bugs: tests named 'BUG: ...' are ordinary regression tests
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

// ===================================================================================== decode

describe('decode', () => {
  test('decodes named, decimal and hex entities', () => {
    assert.equal(decode('Fed &amp; ECB: &lt;b&gt; &quot;hi&quot; it&#8217;s &#x2014; done&hellip;'), 'Fed & ECB: <b> "hi" it’s — done…');
  });

  test('turns &nbsp; into whitespace', () => {
    assert.match(decode('a&nbsp;b'), /^a\sb$/);
  });

  test('decodes exactly once, so double-escaped input keeps one level of escaping', () => {
    assert.equal(decode('AT&amp;amp;T'), 'AT&amp;T');
    assert.equal(decode('&amp;#8217;'), '&#8217;');
    assert.equal(decode('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
  });

  test('leaves unknown entities and unterminated ampersands alone', () => {
    assert.equal(decode('a &unknown; b &amp c & d'), 'a &unknown; b &amp c & d');
  });

  test('treats null and undefined as empty text', () => {
    assert.equal(decode(null), '');
    assert.equal(decode(undefined), '');
  });
});

// ===================================================================================== cleanText

describe('cleanText', () => {
  // [what it shows, raw input, expected output]
  const CLEANING = [
    // links
    ['removes a t.co link from the middle of a post', 'Capcom confirms breach https://t.co/abc123 of 11.7M accounts', 'Capcom confirms breach of 11.7M accounts'],
    ['removes several trailing links', 'Ransomware gang hits hospital network https://t.co/Zk3JdQ9 https://t.co/9Qd3Jk', 'Ransomware gang hits hospital network'],
    ['removes plain http links too', 'Patch now http://example.com/advisory please', 'Patch now please'],
    // emoji
    ['removes alert emoji at the start', '🚨🚨 Ransomware gang hits hospital network', 'Ransomware gang hits hospital network'],
    ['removes a ZWJ pirate-flag emoji at the end', 'Ransomware gang hits hospital network 🏴‍☠️', 'Ransomware gang hits hospital network'],
    ['removes flag emoji next to an alert emoji', '🚨🇹🇼 PopChill allegedly breached, data on 435,000 users exposed', 'PopChill allegedly breached, data on 435,000 users exposed'],
    ['removes the double-exclamation emoji and keeps the sentence', '‼️ Ransomware gang Kazu claims it stole 1.6M+ claim records from Rand Mutual, which covers 1M+ South African mine and metalworkers.', 'Ransomware gang Kazu claims it stole 1.6M+ claim records from Rand Mutual, which covers 1M+ South African mine and metalworkers.'],
    // alert prefixes
    ['strips BREAKING:', 'BREAKING: Russia launches missile barrage on Kyiv', 'Russia launches missile barrage on Kyiv'],
    ['strips Breaking news:', 'Breaking news: Explosion reported near the port in Odesa', 'Explosion reported near the port in Odesa'],
    ['strips BREAKING NEWS -', 'BREAKING NEWS - Explosion reported near the port in Odesa, local officials say', 'Explosion reported near the port in Odesa, local officials say'],
    ['strips JUST IN: and keeps the second sentence', 'JUST IN: Ammonia tank explodes at seafood facility in Newport, Oregon. Area being evacuated.', 'Ammonia tank explodes at seafood facility in Newport, Oregon. Area being evacuated.'],
    ['strips WARNING - with an ASCII hyphen', 'WARNING - A researcher just dropped a report on Tailscale SSH flaws', 'A researcher just dropped a report on Tailscale SSH flaws'],
    ['strips Warning — with an em dash', 'Warning — Critical RCE in Fortinet gear is being exploited', 'Critical RCE in Fortinet gear is being exploited'],
    ['strips emoji, WARNING - and keeps a shouted NO PATCH inside normal text', '‼️ WARNING - A researcher just dropped a report on Tailscale SSH flaws — one compromised device could get root on others, and there’s NO PATCH yet.', 'A researcher just dropped a report on Tailscale SSH flaws — one compromised device could get root on others, and there’s NO PATCH yet.'],
    ['strips stacked prefixes', 'BREAKING: JUST IN: Explosion reported near the port in Odesa, local officials say', 'Explosion reported near the port in Odesa, local officials say'],
    ['strips DEVELOPING |', 'DEVELOPING | Power outage hits large parts of Lisbon and Madrid', 'Power outage hits large parts of Lisbon and Madrid'],
    ['strips UPDATE:', 'UPDATE: Death toll rises to 12 after the quake in Nepal', 'Death toll rises to 12 after the quake in Nepal'],
    ['strips ALERT!', 'ALERT! Citrix patches actively exploited NetScaler bug', 'Citrix patches actively exploited NetScaler bug'],
    ['strips Exclusive:', 'Exclusive: Hackers breach three European airports', 'Hackers breach three European airports'],
    ['only strips prefixes at the start of the text', 'Fortinet issues emergency patch. Warning: exploitation is under way', 'Fortinet issues emergency patch. Warning: exploitation is under way'],
    // hashtags
    ['drops trailing hashtags', 'Hackers breach telecom giant #cybersecurity #infosec #ransomware', 'Hackers breach telecom giant'],
    ['drops trailing hashtags and an emoji', 'Iran fires missiles at Israel 🚨 #Iran #Israel #breaking', 'Iran fires missiles at Israel'],
    ['keeps the word of an inline hashtag but drops the hash', 'The #Qilin ransomware group claims attack on law firm #ransomware', 'The Qilin ransomware group claims attack on law firm'],
    ['keeps the word of a leading hashtag', '#Qilin ransomware group claims attack on law firm', 'Qilin ransomware group claims attack on law firm'],
    // bullets
    ['removes a leading bullet', '• Bullet point headline about the new vulnerability', 'Bullet point headline about the new vulnerability'],
    ['removes a leading square bullet', '▪ Bullet point headline about the new vulnerability', 'Bullet point headline about the new vulnerability'],
    ['removes a leading arrow bullet', '► Bullet point headline about the new vulnerability', 'Bullet point headline about the new vulnerability'],
    ['removes a leading star', '* Bullet point headline about the new vulnerability', 'Bullet point headline about the new vulnerability'],
    ['removes the star from a wire headline and re-cases it', '*LULA AT 57.7%, BOLSONARO AT 42.3% AS 0.25% BRAZIL VOTES TALLIED', 'Lula at 57.7%, Bolsonaro at 42.3% as 0.25% Brazil Votes Tallied'],
    // wire credits
    ['removes a -RTS wire credit', 'Breaking: Serbia’s former President Aleksandar Vucic has conceded the election and says that the student-backed list has won -RTS', 'Serbia’s former President Aleksandar Vucic has conceded the election and says that the student-backed list has won'],
    ['removes a spaced hyphen credit (- AP)', 'Oil jumps 3% as Iran talks stall - AP', 'Oil jumps 3% as Iran talks stall'],
    ['removes an en dash credit (– AFP)', 'Oil jumps 3% as Iran talks stall – AFP', 'Oil jumps 3% as Iran talks stall'],
    ['removes an em dash credit (— CNBC)', 'Oil jumps 3% as Iran talks stall — CNBC', 'Oil jumps 3% as Iran talks stall'],
    ['removes a credit from a shouted line and then re-cases it', 'BON SECOURS IS NEARING A $6 BLN TAKEOVER OF SURGERY PARTNERS IN A DEAL THAT VALUES THE GROUP AT ABOUT $20/SHARE, WITH THE DEAL POSSIBLY ANNOUNCED AS SOON AS MONDAY - FT', 'Bon Secours is Nearing a $6 Bln Takeover of Surgery Partners in a Deal that Values the Group at About $20/Share, with the Deal Possibly Announced as Soon as Monday'],
    ['keeps a long outlet name (not a wire code)', 'Oil jumps 3% as Iran talks stall - Reuters', 'Oil jumps 3% as Iran talks stall - Reuters'],
    // entities and whitespace
    ['decodes &amp;', 'Fed chair says rates may stay high &amp; inflation sticky', 'Fed chair says rates may stay high & inflation sticky'],
    ['decodes entities once, so &amp;amp; stays &amp;', 'AT&amp;amp;T confirms outage', 'AT&amp;T confirms outage'],
    ['decodes numeric entities', 'AT&amp;T confirms outage &#8212; customers affected &#x2014; again', 'AT&T confirms outage — customers affected — again'],
    ['collapses newlines, tabs and runs of spaces', 'Ransomware\n\ngang\t hits   hospital', 'Ransomware gang hits hospital'],
  ];
  for (const [name, raw, want] of CLEANING) test(name, () => assert.equal(cleanText(raw), want));

  describe('shouting wire lines', () => {
    const SHOUTS = [
      ['Title Cases a shouted line and lowers small words', 'TRUMP SAYS HE DOES NOT WANT ANYBODY FROM NORWAY AND DOES NOT WANT ANYTHING TO DO WITH NORWAY', 'Trump Says He Does Not Want Anybody from Norway and Does Not Want Anything to Do with Norway'],
      ['keeps NATO, US, U.S., GPS, CISA, CVE and SSH upper case', 'NATO CHIEF SAYS US AND U.S. FORCES WILL HOLD GPS JAMMING TALKS WITH CISA AFTER CVE EXPLOIT IN SSH', 'NATO Chief Says US and U.S. Forces Will Hold GPS Jamming Talks with CISA after CVE Exploit in SSH'],
      ['keeps U.S. with its full stops', 'U.S. SECRETARY OF STATE RUBIO SAYS THE U.S. EXPECTS THE FREEDOMS OF ALL SECTORS OF VENEZUELAN POLITICS TO CONTINUE TO BE RESPECTED', 'U.S. Secretary of State Rubio Says the U.S. Expects the Freedoms of All Sectors of Venezuelan Politics to Continue to be Respected'],
      ['keeps UN upper case and lowers the, of, in, as', 'ISRAELI STRIKES HIT GAZA CITY AS THE UN WARNS OF FAMINE IN THE NORTH OF THE STRIP', 'Israeli Strikes Hit Gaza City as the UN Warns of Famine in the North of the Strip'],
      ['capitalises a small word when it comes first', 'AN ATTACK ON THE PORT OF ODESA KILLED THREE PEOPLE, OFFICIALS SAID ON SUNDAY', 'An Attack on the Port of Odesa Killed Three People, Officials Said on Sunday'],
      ['handles curly apostrophes and prices', 'ZELENSKIY SAYS THERE IS NO NEED TO BUY RUSSIA’S LOYALTY BY LIFTING SANCTIONS', 'Zelenskiy Says There is No Need to Buy Russia’s Loyalty by Lifting Sanctions'],
      ['keeps numbers and currency symbols intact', 'BRENT CRUDE HITS $116.72, HIGHEST SINCE APRIL, AMID RISING MIDDLE EAST TENSIONS', 'Brent Crude Hits $116.72, Highest Since April, amid Rising Middle East Tensions'],
      ['re-cases a shouted line after stripping its prefix', 'JUST IN: TRUMP SAYS THE U.S. WILL NOT STRIKE IRAN TODAY AS TALKS CONTINUE IN OMAN THIS WEEK', 'Trump Says the U.S. Will Not Strike Iran Today as Talks Continue in Oman This Week'],
      ['re-cases a shouted line after a WARNING - prefix', 'WARNING - CISA ORDERS FEDERAL AGENCIES TO PATCH THE CITRIX FLAW WITHIN THREE DAYS AFTER ACTIVE EXPLOITATION', 'CISA Orders Federal Agencies to Patch the Citrix Flaw Within Three Days after Active Exploitation'],
    ];
    for (const [name, raw, want] of SHOUTS) test(name, () => assert.equal(cleanText(raw), want));

    test('a shouted prefix followed by normal text re-cases only the prefix', () => {
      assert.equal(
        cleanText('RUSSIA LAUNCHES MASSIVE DRONE ATTACK ON KYIV overnight, officials said, as sirens sounded across the capital for hours'),
        'Russia Launches Massive Drone Attack on Kyiv overnight, officials said, as sirens sounded across the capital for hours',
      );
    });

    test('the first word of the next sentence is not treated as part of the shout', () => {
      assert.equal(
        cleanText('KUWAIT: THREAT ACTOR SELLS ALLEGED BLIZZARD COMPUTER STORE CUSTOMER AND PAYMENT DATA A threat actor on an underground forum is selling what it claims is customer and payment data.'),
        'Kuwait: Threat Actor Sells Alleged Blizzard Computer Store Customer and Payment Data A threat actor on an underground forum is selling what it claims is customer and payment data.',
      );
    });

    test('a shouted prefix is re-cased after emoji and flags are removed', () => {
      assert.equal(
        cleanText('🇺🇸 🚨 QILIN RANSOMWARE CLAIMS GLOBAL LAW FIRM WHITE & CASE The Qilin ransomware group has added White & Case to its leak site.'),
        'Qilin Ransomware Claims Global Law Firm White & Case The Qilin ransomware group has added White & Case to its leak site.',
      );
    });

    test('normal mixed-case text with a few acronyms is left exactly as written', () => {
      for (const s of ['CISA adds Fortinet flaw to KEV catalog and orders agencies to patch', 'NATO and EU leaders meet in Brussels as Russia expands drone attacks', 'Ransomware gang Kazu claims it stole 1.6M+ claim records from Rand Mutual']) {
        assert.equal(cleanText(s), s);
      }
    });
  });

  describe('empty and odd input', () => {
    for (const [name, raw] of [['an empty string', ''], ['null', null], ['undefined', undefined], ['only whitespace', '   \n\t '], ['only emoji', '🚨🚨🚨'], ['only a link', 'https://example.com/only-a-link'], ['emoji and a link', '🚨 https://t.co/abc']]) {
      test(`returns an empty string for ${name}`, () => assert.equal(cleanText(raw), ''));
    }
    test('stringifies a number instead of throwing', () => assert.equal(cleanText(42), '42'));
  });
});

// ===================================================================================== headlineOf

describe('headlineOf', () => {
  test('uses the first sentence when it is 40-140 characters and drops its final full stop', () => {
    assert.equal(headlineOf('JUST IN: Ammonia tank explodes at seafood facility in Newport, Oregon. Area being evacuated.'), 'Ammonia tank explodes at seafood facility in Newport, Oregon');
  });

  test('keeps a question mark at the end of the first sentence', () => {
    assert.equal(headlineOf('Is your VPN safe from the newest wave of attacks? Researchers found 12 critical flaws in popular products.'), 'Is your VPN safe from the newest wave of attacks?');
  });

  test('skips a first sentence shorter than 40 characters and keeps the whole text when that fits', () => {
    assert.equal(
      headlineOf('Hospital hit. The attackers demanded a ransom of two million dollars and threatened to publish patient files.'),
      'Hospital hit. The attackers demanded a ransom of two million dollars and threatened to publish patient files',
    );
  });

  test('drops a single trailing full stop from short single-sentence text', () => {
    assert.equal(headlineOf('Capcom confirms breach of 11.7M accounts.'), 'Capcom confirms breach of 11.7M accounts');
  });

  test('keeps a trailing three-dot ellipsis', () => {
    assert.equal(headlineOf('Waiting for the next shoe to drop...'), 'Waiting for the next shoe to drop...');
  });

  describe('does not split a sentence at an abbreviation or a number', () => {
    const NO_SPLIT = [
      ['U.S.', 'Sanctions were announced against three Iranian shipping firms by the U.S. Treasury on Friday. Officials said more were coming.', 'Sanctions were announced against three Iranian shipping firms by the U.S. Treasury on Friday'],
      ['Dr.', 'The outbreak in the eastern province is slowing, according to Dr. Jane Smith of the Mayo Clinic. Cases fell sharply this week.', 'The outbreak in the eastern province is slowing, according to Dr. Jane Smith of the Mayo Clinic'],
      ['a single initial (J.)', 'Federal prosecutors in the Southern District of New York have charged J. Edgar Smith with fraud. More charges are expected.', 'Federal prosecutors in the Southern District of New York have charged J. Edgar Smith with fraud'],
      ['Inc.', 'The ransomware group claimed an attack on Acme Holdings Inc. Its servers were encrypted over the weekend and staff are offline.', 'The ransomware group claimed an attack on Acme Holdings Inc. Its servers were encrypted over the weekend and staff are offline'],
      ['a decimal (3.5)', 'Researchers released version 3.5 of the toolkit after the long delay caused by the incident. More fixes will follow soon.', 'Researchers released version 3.5 of the toolkit after the long delay caused by the incident'],
    ];
    for (const [what, raw, want] of NO_SPLIT) test(`at ${what}`, () => assert.equal(headlineOf(raw), want));
  });

  describe('long text', () => {
    const LONG = 'Researchers at a European university have published a detailed analysis of a sophisticated multi-stage intrusion campaign that targeted hospitals, universities and municipal governments across at least eleven countries over eight months';

    test('is cut at a word boundary and ends with an ellipsis', () => {
      const h = headlineOf(LONG);
      assert.ok(h.endsWith('…'), h);
      assert.ok(h.length <= 140, `${h.length} chars`);
      const body = h.slice(0, -1);
      assert.ok(LONG.startsWith(body), 'the cut is a prefix of the text');
      assert.equal(LONG[body.length], ' ', 'the cut falls on a word boundary');
    });

    test('honours a custom limit', () => {
      const h = headlineOf(LONG, 60);
      assert.ok(h.length <= 60, `${h.length} chars`);
      assert.ok(h.endsWith('…'));
      assert.equal(h, 'Researchers at a European university have published a…');
    });

    test('falls back to the word cut when the first sentence is longer than the limit', () => {
      const h = headlineOf(`${LONG}. Short follow up.`);
      assert.ok(h.endsWith('…'));
      assert.ok(h.length <= 140);
    });

    test('cuts a single unbroken token at the limit instead of overflowing', () => {
      const h = headlineOf('x'.repeat(500));
      assert.equal(h.length, 140);
      assert.ok(h.endsWith('…'));
    });

    test('shouted long text is title-cased before it is cut', () => {
      const h = headlineOf('KUWAIT: THREAT ACTOR SELLS ALLEGED BLIZZARD COMPUTER STORE CUSTOMER AND PAYMENT DATA A threat actor on an underground forum is selling what it claims is customer and payment data.');
      assert.equal(h, 'Kuwait: Threat Actor Sells Alleged Blizzard Computer Store Customer and Payment Data A threat actor on an underground forum is selling…');
      assert.ok(h.length <= 140);
    });
  });

  test('applies cleanText first: links, emoji, prefixes, hashtags and shouting are gone', () => {
    assert.equal(headlineOf('🚨 BREAKING: BITCOIN DROPS TO $80,400 AMID BEARISH MOMENTUM, RIPPLE BREACHES $1.30 SUPPORT https://t.co/xyz #bitcoin'), 'Bitcoin Drops to $80,400 amid Bearish Momentum, Ripple Breaches $1.30 Support');
  });

  for (const [name, raw] of [['an empty string', ''], ['null', null], ['undefined', undefined], ['whitespace', '  '], ['only emoji and a link', '🚨 https://t.co/abc']]) {
    test(`returns an empty string for ${name}`, () => assert.equal(headlineOf(raw), ''));
  }
});

// ===================================================================================== topicsOf

describe('topicsOf', () => {
  const ZERO_DAY = 'Zero-day exploited in the wild: patches released for critical RCE vulnerability CVE-2026-0001';

  test('returns at most two labels by default, in rule priority order', () => {
    assert.deepEqual(topicsOf(ZERO_DAY), ['Zero-day', 'Exploited']);
  });

  test('honours a larger or smaller max', () => {
    assert.deepEqual(topicsOf(ZERO_DAY, 'cyber', 3), ['Zero-day', 'Exploited', 'Vulnerability']);
    assert.deepEqual(topicsOf(ZERO_DAY, 'cyber', 1), ['Zero-day']);
  });

  test('never repeats a label and never exceeds max', () => {
    const t = 'Ransomware ransomware ransomware: LockBit, Akira and Qilin leaked data and database records in a data breach';
    for (const max of [1, 2, 3, 5]) {
      const out = topicsOf(t, 'cyber', max);
      assert.ok(out.length <= max);
      assert.equal(new Set(out).size, out.length);
    }
  });

  test('is case-insensitive', () => {
    assert.deepEqual(topicsOf('RANSOMWARE ATTACK HITS HOSPITAL'), ['Ransomware']);
  });

  test('puts Ransomware ahead of Data breach when both apply', () => {
    assert.deepEqual(topicsOf('Ransomware gang Kazu claims it stole 1.6M+ claim records from Rand Mutual'), ['Ransomware', 'Data breach']);
  });

  test('returns no topics for unrelated, empty or missing text', () => {
    assert.deepEqual(topicsOf('Weather is nice today'), []);
    assert.deepEqual(topicsOf(''), []);
    assert.deepEqual(topicsOf(undefined), []);
  });

  describe('ransomware group names trigger Ransomware', () => {
    for (const group of ['LockBit', 'Akira', 'Qilin', 'Cl0p', 'Clop', 'BlackCat', 'ALPHV', 'Rhysida', 'Medusa', 'BianLian', 'DragonForce', 'SafePay']) {
      test(`${group} on its own is enough`, () => assert.deepEqual(topicsOf(`${group} adds a regional hospital group to its victim list`), ['Ransomware']));
    }
    test('Play counts when it is followed by "ransom"', () => assert.deepEqual(topicsOf('Play ransom gang hits Texas county'), ['Ransomware']));
  });

  describe('data leaks', () => {
    test('"leaked document" is not a Data breach', () => {
      assert.deepEqual(topicsOf('A leaked document shows the agency planned the operation'), []);
      assert.deepEqual(topicsOf('France’s prime minister told mobile operators to be ready to block TikTok during the protests, a leaked letter shows'), []);
    });
    for (const what of ['data', 'records', 'accounts', 'database', 'credentials', 'emails']) {
      test(`"leaked ${what}" is a Data breach`, () => assert.deepEqual(topicsOf(`Hackers leaked ${what} belonging to a retailer`), ['Data breach']));
    }
    test('"breach" and "breached" are Data breach', () => {
      assert.deepEqual(topicsOf('Hackers breach telecom operator'), ['Data breach']);
      assert.deepEqual(topicsOf('Hackers breached telecom operator'), ['Data breach']);
    });
  });

  describe('real headlines (cyber)', () => {
    const REAL = [
      ['Resident Evil maker Capcom says a hack of its Capcom ID service leaked data on 11.7 million accounts. The attackers got email addresses, IP addresses and login records.', ['Data breach']],
      ['Unpatched Tailscale SSH Flaws Could Let a Hacked Device Reach Root on Other Servers', ['Vulnerability']],
      ['PHP2Shell Exploitation Hits Government Entity Amid Global Scanning and Signs of AI-Assisted Hacking', ['Exploited', 'AI']],
      ['Ransomware gang Emperador claims it stole 3.9GB from AB InBev, maker of Budweiser, Corona and Stella Artois.', ['Ransomware']],
      ['AI coding agents hijacked using AGENTS.md file in Downloads folder', ['AI']],
      ['A bug bounty hunter says they rooted their 2025 Samsung TV with zero-days and found an AI model tracking what viewers watch', ['Zero-day', 'AI']],
      ['DDoS Alert: Dark Storm Team claims to have targeted multiple websites in France', ['DDoS & outages']],
      ['Lindt Japan: 3.15 million member records exposed in breach at e-commerce provider futureshop', ['Data breach']],
      ['Open-box Beats Solo 4 headphones with a 50-hour battery are $89.99', []],
      ['Researcher publishes 11 unpatched security flaws affecting Tailscale and headscale', ['Vulnerability']],
      ['Phishing campaign abuses npm supply chain to steal tokens', ['Phishing', 'Supply chain']],
    ];
    for (const [text, want] of REAL) test(`${text.slice(0, 70)}…`, () => assert.deepEqual(topicsOf(text), want));
  });

  describe('groups', () => {
    test('crisis uses war-room labels', () => {
      assert.deepEqual(topicsOf('Israeli air strike on Gaza City university kills three people', 'crisis'), ['Strikes']);
      assert.deepEqual(topicsOf('Drone strike off Constanta kills one sailor; missile hit the tanker in the Strait', 'crisis'), ['Strikes', 'Drones']);
      assert.deepEqual(topicsOf('Ceasefire talks resume; nuclear enrichment on the agenda', 'crisis'), ['Ceasefire & talks', 'Nuclear']);
    });
    test('markets uses market labels', () => {
      assert.deepEqual(topicsOf('Brent crude hits $116 as Fed signals rates stay high', 'markets'), ['Oil & energy', 'Rates & central banks']);
      assert.deepEqual(topicsOf('Bitcoin drops to $80,400', 'markets'), ['Crypto']);
    });
    test('crisis and markets do not use the cyber labels', () => {
      assert.deepEqual(topicsOf('Phishing campaign abuses npm supply chain to steal tokens', 'markets'), []);
      assert.ok(!topicsOf('Qilin ransomware group hits law firm', 'crisis').includes('Ransomware'));
    });
    for (const group of ['redteam', 'blueteam', 'darkweb', 'cyber']) {
      test(`${group} shares the cyber rules`, () => assert.deepEqual(topicsOf('Phishing campaign abuses npm supply chain to steal tokens', group), ['Phishing', 'Supply chain']));
    }
    test('an unknown group falls back to the cyber rules', () => {
      assert.deepEqual(topicsOf('Qilin ransomware group hits law firm', 'no-such-group'), ['Ransomware']);
    });
  });

  test('gives the same answer on repeated calls (no regex state leaks between calls)', () => {
    const first = topicsOf('Qilin ransomware group hits law firm');
    for (let i = 0; i < 5; i++) assert.deepEqual(topicsOf('Qilin ransomware group hits law firm'), first);
  });
});

// ===================================================================================== normalizeBreaking

// copy of config/breaking.json "crisisRelevant", inlined so these tests never read config
const CFG = { crisisRelevant: '\\b(war|wars|military|army|navy|air force|troops?|missiles?|drones?|strikes?|airstrikes?|attack(ed|s)?|killed|casualt\\w*|invasion|ceasefire|truce|hostages?|bomb\\w*|explosions?|shelling|frontline|nato|russia\\w*|ukrain\\w*|iran\\w*|israel\\w*|gaza|hamas|hezbollah|houthi\\w*|china|taiwan|korea\\w*|sanctions?|nuclear|coup|terror\\w*|spy|spying|espionage|cyber\\w*|hack\\w*|emergency|evacuat\\w*|refugees?|conflict|embassy|intelligence)\\b' };
const NOW = Date.parse('2026-10-25T21:00:00Z');
const ago = (hours) => new Date(NOW - hours * 36e5).toISOString();
let seq = 0;
const post = (o = {}) => ({ id: `fx${++seq}`, kind: 'x', group: 'cyber', source: '@IntCyberDigest', url: `https://x.com/i/status/${seq}`, severity: 'normal', verified: false, published: ago(1), ...o });
const norm = (...items) => normalizeBreaking(items.map((o) => post(o)), CFG);

describe('normalizeBreaking', () => {
  const BASE = 'Qilin ransomware claims a regional hospital group in Ohio';

  describe('keeps real, on-topic items', () => {
    const KEPT = [
      ['a cyber X post with a security topic', { group: 'cyber', kind: 'x', title: 'Ransomware gang Emperador claims it stole 3.9GB from AB InBev, maker of Budweiser, Corona and Stella Artois.' }],
      ['a cyber news item', { group: 'cyber', kind: 'news', source: 'BleepingComputer', title: 'Unpatched Tailscale SSH Flaws Could Let a Hacked Device Reach Root on Other Servers' }],
      ['a war-room X post that names an event (strikes)', { group: 'crisis', kind: 'x', source: '@sentdefender', title: 'Construction continues at Iran’s mountain airbase with underground hangars, despite at least three rounds of strikes this year' }],
      ['a war-room X post that names an event (evacuated)', { group: 'crisis', kind: 'x', source: '@BNONews', title: 'JUST IN: Ammonia tank explodes at seafood facility in Newport, Oregon. Area being evacuated.' }],
      ['a war-room X post that names an event (drones)', { group: 'crisis', kind: 'x', source: '@Conflicts', title: 'Russia says its air defences shot down 20 Ukrainian drones over Crimea overnight' }],
      ['war-room news that matches the configured pattern (strike, Gaza)', { group: 'crisis', kind: 'news', source: 'Al Jazeera', title: 'Israeli air strike on Gaza City university kills three people' }],
      ['war-room news that matches the configured pattern (Israel)', { group: 'crisis', kind: 'news', source: 'Al Jazeera', title: 'Jerusalem Daily: Israel expels thousands from Hebron' }],
      ['war-room news that matches the configured pattern (elections)', { group: 'crisis', kind: 'news', source: 'Al Jazeera', title: 'US and Israel elections: New leaders, same policies?' }],
      ['a markets post about oil', { group: 'markets', kind: 'x', source: '@FirstSquawk', title: 'BRENT CRUDE HITS $116.72, HIGHEST SINCE APRIL, AMID RISING MIDDLE EAST TENSIONS' }],
      ['a markets post about bitcoin', { group: 'markets', kind: 'x', source: '@FirstSquawk', title: 'BITCOIN DROPS TO $80,400 AMID BEARISH MOMENTUM, RIPPLE BREACHES $1.30 SUPPORT' }],
      ['a markets post about a stock plunge', { group: 'markets', kind: 'x', source: '@business', title: 'Hong Kong’s private wealth managers are dangling seductive structured products to clients in the wake of CoreWeave’s stock plunge' }],
      ['a markets post about oil prices', { group: 'markets', kind: 'x', source: '@FirstSquawk', title: 'GLOBAL OIL PRICES COULD SURGE PAST $150 IF CONFLICTS RESTART' }],
      ['a dark web ransomware listing', { group: 'darkweb', kind: 'ransomware', source: 'ransomware.live', title: 'Qilin claims White & Case — Legal Services' }],
    ];
    for (const [name, o] of KEPT) test(name, () => assert.equal(norm(o).length, 1));
  });

  describe('drops promos', () => {
    const PROMOS = ['Use code OUTPOST for 20% off', 'Join our Discord for daily updates', 'Subscribe to our newsletter', 'Register now for the webinar', 'Link in bio', 'Sponsored by Acme Security',
      'Now hiring threat analysts', 'We’re hiring threat researchers', 'New podcast out today', 'Episode 42 is live', 'Enter our giveaway', 'Black Friday discount ends tonight', 'Use the promo code CYBER'];
    test('the unadorned control item is kept', () => assert.equal(norm({ kind: 'news', title: BASE }).length, 1));
    for (const promo of PROMOS) test(`drops "${promo}"`, () => assert.equal(norm({ kind: 'news', title: `${BASE}. ${promo}` }).length, 0));
  });

  describe('drops short items', () => {
    for (const [name, o] of [
      ['a two-word X post, even at high severity', { group: 'redteam', kind: 'x', source: '@_dirkjan', severity: 'high', title: 'Current status' }],
      ['a three-word news title', { kind: 'news', title: 'Ransomware hit' }],
      ['a title that is short once the link and prefix are cleaned away', { kind: 'news', title: 'BREAKING: Ransomware hit https://t.co/abcdefghijklmnopqrstuvwxyz' }],
      ['an item that is only a link', { kind: 'news', title: 'https://example.com/a-very-long-link-that-is-not-text-at-all-just-a-url' }],
    ]) test(name, () => assert.equal(norm(o).length, 0));
    test('length is judged on the cleaned text, so a long link does not rescue a short post', () => {
      assert.equal(norm({ kind: 'news', title: 'Ransomware hit https://t.co/abcdefghijklmnopqrstuvwxyz0123456789' }).length, 0);
    });
  });

  describe('drops opinion-style war-room X posts that name no event', () => {
    for (const [name, title] of [
      ['political venting', 'When ilhan omar wins, just know that republicans are going into slavery. #XoogMaga'],
      ['sports chatter', 'F1 folks; is Kimi getting it this weekend then?'],
      ['a first-person take', 'Honestly I think everyone is overreacting about this whole situation and that is just my take'],
    ]) test(name, () => assert.equal(norm({ group: 'crisis', kind: 'x', source: '@WarMonitors', title }).length, 0));
  });

  describe('drops war-room news that is off-topic for the configured pattern', () => {
    for (const title of [
      'Verstappen wins in Austin as Norris crashes out of the lead on the final lap',
      'Royal family unveils new portrait ahead of the state banquet',
      'Taylor Swift announces new album ahead of the final leg of her tour',
    ]) test(title, () => assert.equal(norm({ group: 'crisis', kind: 'news', source: 'BBC World', title }).length, 0));

    test('without a configured pattern no war-room news passes, but event-bearing X posts still do', () => {
      const title = 'Israeli air strike on Gaza City university kills three people';
      assert.equal(normalizeBreaking([post({ group: 'crisis', kind: 'news', title })]).length, 0);
      assert.equal(normalizeBreaking([post({ group: 'crisis', kind: 'x', title })]).length, 1);
    });
  });

  describe('drops markets items that are not market news', () => {
    for (const title of [
      'My father-in-law, 81, sold his $75,000 home to pay his daughter’s $50,000 debt. How can I keep him from becoming destitute?',
      'We stopped helping our neighbors with free home repairs and our friendship cooled. Who’s to blame?',
      '‘I don’t feel sorry for myself’: I’m 64 and will be renting for the rest of my life. Is that so bad?',
      'My partner of 17 years left me his $1 million home. His children are livid. Am I obliged to split it with them?',
    ]) test(title.slice(0, 60) + '…', () => assert.equal(norm({ group: 'markets', kind: 'news', source: 'MarketWatch', title }).length, 0));
  });

  describe('drops brand chatter from cyber X accounts that has no security topic', () => {
    const CHATTER = 'Great turnout at our meetup in Berlin yesterday, thanks to everyone who came by and chatted with the team';
    for (const group of ['cyber', 'redteam', 'blueteam']) test(`in the ${group} group`, () => assert.equal(norm({ group, kind: 'x', title: CHATTER }).length, 0));
    test('a real vendor marketing post', () => {
      assert.equal(norm({ group: 'blueteam', kind: 'x', source: '@CrowdStrike', title: 'Austin runs loud. F1 runs fast. And when every millisecond counts, visibility is everything. We’re ready for lights out at the United States Grand Prix with @MercedesAMGF1. 🏁' }).length, 0);
    });
    test('the same words from a news outlet are kept', () => assert.equal(norm({ group: 'cyber', kind: 'news', title: CHATTER }).length, 1));
    test('the same words marked high severity are kept', () => assert.equal(norm({ group: 'cyber', kind: 'x', severity: 'high', title: CHATTER }).length, 1));
    test('a post with a security topic is kept', () => assert.equal(norm({ group: 'cyber', kind: 'x', title: 'Great turnout at our workshop on ransomware negotiation yesterday in Berlin' }).length, 1));
  });

  describe('merges near-duplicates', () => {
    const CAPCOM_X = 'Resident Evil maker Capcom says a hack of its Capcom ID service leaked data on 11.7 million accounts. The attackers got email addresses, IP addresses and login records.';
    const CAPCOM_NEWS = 'Capcom says hack of its Capcom ID service leaked data on 11.7 million accounts';

    test('the verified news item leads and the X post is listed in `also`', () => {
      const rows = norm({ kind: 'x', source: '@IntCyberDigest', title: CAPCOM_X, published: ago(1) }, { kind: 'news', source: 'BleepingComputer', verified: true, title: CAPCOM_NEWS, published: ago(2) });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].kind, 'news');
      assert.equal(rows[0].source, 'BleepingComputer');
      assert.deepEqual(rows[0].also.map((a) => a.source), ['@IntCyberDigest']);
    });

    test('the news item leads even when it is older than the X posts', () => {
      const rows = norm(
        { kind: 'x', source: '@x1', title: 'Fortinet firewall zero-day exploited in the wild, patch available now', published: ago(1) },
        { kind: 'news', source: 'BleepingComputer', title: 'Fortinet firewall zero-day exploited in the wild, patch available now', published: ago(3) },
        { kind: 'x', source: '@x2', title: 'Fortinet firewall zero-day exploited in the wild, patch available now!', published: ago(2) },
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].source, 'BleepingComputer');
      assert.equal(rows[0].published, ago(3), 'the row keeps the lead item’s own timestamp');
      assert.deepEqual(rows[0].also.map((a) => a.source).sort(), ['@x1', '@x2']);
    });

    test('`also` entries carry exactly source, url and kind', () => {
      const [row] = norm({ kind: 'x', source: '@x1', url: 'https://x.com/x1/status/1', title: CAPCOM_X, published: ago(1) }, { kind: 'news', source: 'BleepingComputer', title: CAPCOM_NEWS, published: ago(2) });
      assert.deepEqual(row.also, [{ source: '@x1', url: 'https://x.com/x1/status/1', kind: 'x' }]);
    });

    test('without a news item the newest post leads', () => {
      const rows = norm(
        { kind: 'x', source: '@old', title: 'Israeli air strike hits Gaza City university, killing three people', group: 'crisis', published: ago(3) },
        { kind: 'x', source: '@new', title: 'Israeli air strike on Gaza City university kills three people', group: 'crisis', published: ago(1) },
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].source, '@new');
      assert.deepEqual(rows[0].also.map((a) => a.source), ['@old']);
    });

    test('an item that merges nothing has an empty `also`', () => {
      assert.deepEqual(norm({ kind: 'news', title: BASE })[0].also, []);
    });

    test('unrelated stories in the same group stay separate', () => {
      const rows = norm({ kind: 'news', title: 'Fortinet firewall zero-day exploited in the wild, patch available now' }, { kind: 'news', title: 'Researchers publish analysis of new macOS stealer distributed through fake installers' });
      assert.equal(rows.length, 2);
    });

    test('the same story in different groups is not merged', () => {
      const title = 'Researchers disclose critical flaw in Fortinet firewall appliances';
      assert.equal(norm({ group: 'cyber', kind: 'news', title }, { group: 'redteam', kind: 'news', title }).length, 2);
    });

    describe('in a busy batch, words that every item shares do not count as overlap', () => {
      // ten "Ransomware Alert" template posts: they share a lot of words but name different victims
      const GROUPS = ['Qilin', 'Akira', 'Medusa', 'Rhysida', 'Lynx', 'Cloak', 'Everest', 'Interlock', 'Sinobi', 'Play'];
      const VICTIMS = ['Hossner Textil, Brightline Logistics', 'Northwind Dental, Corvid Analytics', 'Pinecrest Hospital, Ardent Steelworks', 'Lakeside Academy, Orbital Freight', 'Granite Insurance, Meridian Foods',
        'Bluepeak Software, Harbor Shipping', 'Redwood Clinic, Summit Plastics', 'Silverline Telecom, Oakmont Legal', 'Crescent Energy, Willow Retail', 'Ridge Hotel, Ironclad Machinery'];
      const template = () => GROUPS.map((g, i) => ({ group: 'darkweb', kind: 'x', source: '@FalconFeedsio', published: ago(5 + i / 10), title: `🚨 Ransomware Alert 🚨 ${g} ransomware group has added 2 new victims to their dark web portal. ${VICTIMS[i]}` }));

      test('template posts about different victims stay separate', () => {
        const rows = norm(...template());
        assert.equal(rows.length, 10);
        assert.ok(rows.every((r) => r.also.length === 0));
      });

      test('two template posts from the same group about different victims stay separate', () => {
        const same = [
          { group: 'darkweb', kind: 'x', source: '@FalconFeedsio', published: ago(1), title: '🚨 Ransomware Alert 🚨 Qilin ransomware group has added 2 new victims to their dark web portal. Alpha Mining, Bravo Tools' },
          { group: 'darkweb', kind: 'x', source: '@FalconFeedsio', published: ago(2), title: '🚨 Ransomware Alert 🚨 Qilin ransomware group has added 2 new victims to their dark web portal. Charlie Foods, Delta Press' },
        ];
        assert.equal(norm(...template(), ...same).length, 12);
      });

      test('the same story reported twice still merges, and the rest of the batch is untouched', () => {
        const story = 'Qilin ransomware group has added White & Case LLP to their dark web portal, a global law firm';
        const rows = norm(...template(), { group: 'darkweb', kind: 'x', source: '@FalconFeedsio', published: ago(1), title: `🚨 Ransomware Alert 🚨 ${story}` }, { group: 'darkweb', kind: 'x', source: '@DailyDarkWeb', published: ago(2), title: `🚨 ${story}!` });
        assert.equal(rows.length, 11);
        assert.deepEqual(rows.find((r) => r.also.length).also.map((a) => a.source), ['@DailyDarkWeb']);
      });
    });

    test('the result does not depend on the order of the input', () => {
      const items = [
        post({ kind: 'x', source: '@a', title: CAPCOM_X, published: ago(1) }),
        post({ kind: 'news', source: 'BleepingComputer', title: CAPCOM_NEWS, published: ago(2) }),
        post({ kind: 'news', source: 'The Record', title: 'Researchers publish analysis of new macOS stealer distributed through fake installers', published: ago(4) }),
      ];
      assert.deepEqual(normalizeBreaking([...items].reverse(), CFG), normalizeBreaking(items, CFG));
    });
  });

  describe('output rows', () => {
    test('are newest first, whatever order the input arrives in', () => {
      const titles = ['alpha', 'bravo', 'charlie', 'delta'].map((w) => `Ransomware gang ${w} hits ${w}land hospital network and steals ${w}file backups`);
      const hours = [8, 1, 5, 3];
      const rows = norm(...titles.map((title, i) => ({ kind: 'news', title, published: ago(hours[i]) })));
      assert.deepEqual(rows.map((r) => r.published), [ago(1), ago(3), ago(5), ago(8)]);
    });

    test('carry a tidy headline, the cleaned text, topics and the original fields', () => {
      const [row] = norm({ kind: 'x', group: 'markets', source: '@FirstSquawk', severity: 'high', verified: false, title: '🚨 BREAKING: BITCOIN DROPS TO $80,400 AMID BEARISH MOMENTUM, RIPPLE BREACHES $1.30 SUPPORT https://t.co/xyz' });
      assert.equal(row.headline, 'Bitcoin Drops to $80,400 amid Bearish Momentum, Ripple Breaches $1.30 Support');
      assert.equal(row.text, row.headline);
      assert.deepEqual(row.topics, ['Crypto']);
      assert.deepEqual(row.also, []);
      assert.equal(row.group, 'markets');
      assert.equal(row.source, '@FirstSquawk');
      assert.equal(row.severity, 'high');
      assert.match(row.url, /^https:\/\/x\.com\//);
    });

    test('use the cleaned text for topics: a war-room strike is labelled Strikes', () => {
      assert.deepEqual(norm({ group: 'crisis', kind: 'news', title: 'Israeli air strike on Gaza City university kills three people' })[0].topics, ['Strikes']);
    });

    test('do not mutate the input items or the input array', () => {
      const items = [post({ kind: 'news', title: 'Qilin ransomware claims a regional hospital group in Ohio', published: ago(5) }), post({ kind: 'news', title: 'Researchers publish analysis of new macOS stealer distributed through fake installers', published: ago(2) })];
      const before = JSON.stringify(items);
      normalizeBreaking(items, CFG);
      assert.equal(JSON.stringify(items), before);
    });
  });

  describe('hostile input', () => {
    test('null, undefined and an empty list give an empty result', () => {
      assert.deepEqual(normalizeBreaking(null), []);
      assert.deepEqual(normalizeBreaking(undefined), []);
      assert.deepEqual(normalizeBreaking([]), []);
    });

    test('items with missing fields and non-string titles never throw', () => {
      const hostile = [
        {}, { title: 'x' }, { group: 'cyber' }, { title: 42, group: 'cyber' }, { title: {}, group: 'cyber' }, { title: ['a', 'b'], group: 'cyber' },
        { title: true, group: 'crisis', kind: 'x' }, { title: 'A perfectly normal ransomware headline that is long enough', group: 'cyber', published: null },
        { title: 'Another normal ransomware headline that is long enough too', group: 'cyber', kind: 'news' }, { title: 'Yet another long enough ransomware headline here', group: 'unknown-group', published: 12345 },
        undefined, 'a string', 7,
      ];
      const rows = normalizeBreaking(hostile, CFG);
      assert.ok(Array.isArray(rows));
      for (const r of rows) { assert.ok(r.title && r.group); assert.ok(Array.isArray(r.topics) && Array.isArray(r.also)); assert.equal(typeof r.headline, 'string'); }
    });

    test('null entries anywhere in the list are skipped (this used to throw: the sort dereferenced them before the guard)', () => {
      const valid = post({ kind: 'news', title: 'Qilin ransomware claims a regional hospital group in Ohio' });
      const other = post({ kind: 'news', title: 'Researchers publish analysis of new macOS stealer distributed through fake installers' });
      assert.equal(normalizeBreaking([null, valid], CFG).length, 1);
      assert.equal(normalizeBreaking([valid, null, other, null], CFG).length, 2);
      assert.deepEqual(normalizeBreaking([null, null], CFG), []);
    });

    test('items whose title or group is missing are dropped', () => {
      assert.deepEqual(normalizeBreaking([{ title: BASE }, { group: 'cyber' }, { title: '', group: 'cyber' }], CFG), []);
    });
  });
});

// ===================================================================================== topNow

describe('topNow', () => {
  const at = (h) => new Date(NOW - h * 36e5).toISOString();
  const row = (id, group, hours, extra = {}) => ({ id, group, kind: 'x', source: `@${id}`, title: `Title ${id}`, published: at(hours), severity: 'normal', verified: false, also: [], ...extra });
  const ids = (rows) => rows.map((r) => r.id);

  test('keeps at most two items per group so no desk crowds out the rest', () => {
    const out = topNow([row('c1', 'cyber', 1), row('c2', 'cyber', 2), row('c3', 'cyber', 3), row('w1', 'crisis', 4)], { now: NOW });
    assert.deepEqual(ids(out), ['c1', 'c2', 'w1']);
  });

  test('keeps the two strongest of a crowded group', () => {
    const out = topNow([row('c1', 'cyber', 1), row('c2', 'cyber', 2, { severity: 'high' }), row('c3', 'cyber', 3, { severity: 'high' }), row('c4', 'cyber', 0.2)], { now: NOW });
    assert.deepEqual(ids(out), ['c2', 'c3']);
  });

  test('perGroup can be changed', () => {
    const out = topNow([row('c1', 'cyber', 1), row('c2', 'cyber', 2), row('c3', 'cyber', 3)], { now: NOW, perGroup: 3 });
    assert.equal(out.length, 3);
  });

  test('excludes markets and dark web items however fresh and severe they are', () => {
    const out = topNow([row('m', 'markets', 0.1, { severity: 'high' }), row('d', 'darkweb', 0.1, { severity: 'high' }), row('c', 'cyber', 5)], { now: NOW });
    assert.deepEqual(ids(out), ['c']);
  });

  test('only considers the last 24 hours', () => {
    const out = topNow([row('stale', 'cyber', 25, { severity: 'high' }), row('fresh', 'cyber', 23), row('c', 'crisis', 5)], { now: NOW });
    assert.deepEqual(ids(out).sort(), ['c', 'fresh']);
  });

  test('the window can be changed with hours', () => {
    assert.deepEqual(ids(topNow([row('a', 'cyber', 5), row('b', 'crisis', 2)], { now: NOW, hours: 3 })), ['b']);
    assert.deepEqual(ids(topNow([row('a', 'cyber', 30), row('b', 'crisis', 2)], { now: NOW, hours: 48 })).sort(), ['a', 'b']);
  });

  test('high severity outranks normal severity, even when the normal item is fresher', () => {
    const out = topNow([row('normal-fresh', 'cyber', 0.5), row('high-older', 'cyber', 20, { severity: 'high' })], { now: NOW, perGroup: 1 });
    assert.deepEqual(ids(out), ['high-older']);
  });

  test('corroboration and a verified outlet add weight', () => {
    assert.deepEqual(ids(topNow([row('plain', 'cyber', 1), row('corroborated', 'cyber', 1.5, { also: [{}, {}, {}] })], { now: NOW, perGroup: 1 })), ['corroborated']);
    assert.deepEqual(ids(topNow([row('plain', 'cyber', 1), row('verified', 'cyber', 1.2, { verified: true })], { now: NOW, perGroup: 1 })), ['verified']);
  });

  test('returns the chosen items newest first, not in score order', () => {
    const out = topNow([row('a', 'cyber', 10, { severity: 'high' }), row('b', 'crisis', 1), row('c', 'redteam', 5), row('d', 'blueteam', 3)], { now: NOW });
    assert.deepEqual(ids(out), ['b', 'd', 'c', 'a']);
  });

  test('respects n', () => {
    const items = [row('a', 'cyber', 10), row('b', 'crisis', 1), row('c', 'redteam', 5), row('d', 'blueteam', 3)];
    assert.equal(topNow(items, { now: NOW, n: 2 }).length, 2);
    assert.equal(topNow(items, { now: NOW, n: 1 }).length, 1);
    assert.equal(topNow(items, { now: NOW, n: 99 }).length, 4);
    assert.equal(topNow(items, { now: NOW }).length, 4);
  });

  test('when n cuts the list it keeps the strongest items', () => {
    const items = [row('weak', 'cyber', 20), row('strong', 'crisis', 1, { severity: 'high' }), row('mid', 'redteam', 4)];
    assert.deepEqual(ids(topNow(items, { now: NOW, n: 1 })), ['strong']);
  });

  test('ignores items without a usable timestamp', () => {
    assert.deepEqual(ids(topNow([row('none', 'cyber', 1, { published: undefined }), row('junk', 'cyber', 1, { published: 'not a date' }), row('ok', 'crisis', 2)], { now: NOW })), ['ok']);
  });

  test('an empty list gives an empty result and the input is not mutated', () => {
    assert.deepEqual(topNow([], { now: NOW }), []);
    const items = [row('a', 'cyber', 10), row('b', 'crisis', 1)];
    const before = JSON.stringify(items);
    topNow(items, { now: NOW });
    assert.equal(JSON.stringify(items), before);
  });

  test('defaults `now` to the current clock', () => {
    const live = (h) => new Date(Date.now() - h * 36e5).toISOString();
    assert.deepEqual(ids(topNow([row('recent', 'cyber', 0, { published: live(1) }), row('ancient', 'crisis', 0, { published: live(72) })])), ['recent']);
  });
});

// ===================================================================================== classifyClaim

describe('classifyClaim', () => {
  // row(headline, expected fields, extra record fields): each row is one test; only the fields in `want` are checked
  const row = (headline, want, extra = {}) => ({ rec: { headline, ...extra }, want });

  const CLAIMS = {
    ransomware: [
      row('Qilin claims White & Case on its leak site', { actor: 'Qilin', sector: 'Legal & professional' }),
      row('Akira claims attack on Ohio school district', { actor: 'Akira', sector: 'Education' }),
      row('LockBit lists regional hospital among new victims', { actor: 'LockBit', sector: 'Healthcare' }),
      row('Cl0p publishes victims from the latest file transfer campaign', { actor: 'Cl0p' }),
      row('Everest hits Brazilian retailer', { actor: 'Everest', country: 'BR' }),
      row('INC Ransom targets Australian council', { actor: 'INC Ransom', country: 'AU', sector: 'Government' }),
      row('Hunters International claims German engineering firm', { actor: 'Hunters International', country: 'DE', sector: 'Manufacturing' }),
      row('Scattered Spider hit UK retailer', { actor: 'Scattered Spider', sector: 'Retail & consumer' }),
      row('LOCKBIT CLAIMS REGIONAL HOSPITAL', { actor: 'LockBit', sector: 'Healthcare' }),
      row('Ransomware attack hits Canadian logistics firm', { actor: '', country: 'CA', sector: 'Transport & logistics' }),
      row('Weitz & Luxenberg appears on extortion portal', { actor: '' }),
      row('Post alleges Dental Arts of Atlantis was hit by HYFLOCK ransomware', { actor: 'HYFLOCK', sector: 'Healthcare' }),
      row('Post claims WhiteArmor targeted Brazil\'s Partido Liberal with ransomware', { actor: 'WhiteArmor', country: 'BR' }),
      row('WhiteArmor claims Brazil\'s Partido Liberal on its leak site', { actor: 'WhiteArmor', country: 'BR' }),
      row('Post claims Qilin listed three victims on its dark web portal', { actor: 'Qilin' }),
      row('Post claims PANZER ransomware targeted YOD Ingénierie', { actor: 'PANZER' }),
      row('Post claims Falcon listed Weitz & Luxenberg on a leak site', { actor: 'Falcon', sector: 'Legal & professional' }),
      row('Post claims Astrana Health appears in a leak-site listing', { actor: '', sector: 'Healthcare' }),
      row('Post alleges ECOM Agroindustrial was hit by Qilin ransomware', { actor: 'Qilin' }),
      row('Falcon claims Weitz & Luxenberg', { actor: 'Falcon' }, { kind: 'ransomware' }),
      row('Listing claims HYFLOCK targeted Aesthetic Dental Designs, P.A', { actor: 'HYFLOCK', sector: 'Healthcare' }, { kind: 'ransomware' }),
      row('Listing for an unnamed company', {}, { kind: 'ransomware' }),
      row('Post claims ETO GRUPPE was affected by Qilin ransomware', { actor: 'Qilin', country: 'DE', sector: 'Manufacturing' }, { claim: 'The post alleges that Germany-based automotive company ETO GRUPPE fell victim to Qilin ransomware.' }),
      row('Qilin lists victim; data also offered for sale', { actor: 'Qilin' }),
    ],
    sale: [
      row('Threat actor claims to sell Blizzard Computer Store customer and payment data', { actor: '' }),
      row('Database of French insurer up for sale on forum', { country: 'FR' }),
      row('Seller offers 2.1 million customer records from a Brazilian telecom', { country: 'BR', sector: 'Telecom' }),
      row('Auction: source code of a US fintech', { sector: 'Finance' }),
      row('Actor sells military documents', { sector: 'Defence' }),
      row('Threat actor sells access to a SaaS provider', { sector: 'Technology' }),
      row('Actor claims to sell data attributed to Israeli defense and intelligence bodies', { sector: 'Defence', country: 'IL', records: '4.5TB' }, { claim: 'The title alleges that a threat actor using the name UNC6783 claims to sell about 4.5TB of data from Israeli defense and intelligence bodies.' }),
      row('Post alleges data attributed to Ukraine\'s Prosecutor General\'s Office was offered for sale', { sector: 'Government', country: 'UA' }),
      row('New 0-day for sale', {}),
    ],
    access: [
      row('Threat actor selling RDP access to US retailer', { sector: 'Retail & consumer' }),
      row('Initial access to a Canadian hospital network for sale', { sector: 'Healthcare', country: 'CA' }),
      row('Selling shell access to a UK government server', { sector: 'Government' }),
      row('Actor offers VPN access to a Spanish bank', { sector: 'Finance', country: 'ES' }),
      row('Broker auctions network access to a German manufacturer', { country: 'DE' }),
    ],
    hacktivism: [
      row('NoName057(16) claims DDoS on Danish government sites', { actor: 'NoName057(16)', country: 'DK', sector: 'Government' }),
      row('Anonymous claims defacement of Israeli news portal', { actor: 'Anonymous', country: 'IL' }),
      row('BD Anonymous claims it targeted eType’s website', { actor: 'BD Anonymous' }),
      row('Anonymous Sudan claims DDoS on Microsoft services', { actor: 'Anonymous Sudan' }),
      row('Post claims Dark Storm Team targeted websites in France', { country: 'FR' }),
      row('Dark Storm Team targets Dutch airport websites', { country: 'NL', sector: 'Transport & logistics' }),
      row('Killnet announces new campaign against NATO members', {}),
      row('Keymous claims outage of French banking portals', { actor: 'Keymous', country: 'FR' }),
      row('Server Killers claim attack on Indian ministry websites', { actor: 'Server Killers', country: 'IN', sector: 'Government' }),
      row('Hacktivists deface municipal sites across Poland', { country: 'PL', sector: 'Government' }),
      row('Anonymous leaks data of a ministry', { sector: 'Government' }),
    ],
    vuln: [
      row('Researcher publishes PoC for critical Fortinet flaw', {}, { claim: 'CVE-2026-1234 allows remote code execution.' }),
      row('Zero-day in popular VPN appliance being exploited', { sector: 'Technology' }),
      row('Proof-of-concept released for Windows privilege escalation', {}),
      row('Post claims a researcher published flaws affecting Tailscale and headscale', {}),
      row('Post alleges an Initia bridge exploit involved fake tokens and drained reserves', {}),
      row('Researcher discloses flaw that exposed records', {}),
    ],
    leak: [
      row('Actor claims PopChill was breached and user data exposed', { actor: '' }),
      row('Actor claims Cambodia digital technology institutions were breached and files leaked', { country: 'KH', countryName: 'Cambodia' }),
      row('Post claims Delatad was breached and sensitive information exposed', { actor: '' }),
      row('Hacker leaks database of French political party', { country: 'FR' }),
      row('Employee records exposed after misconfigured bucket', {}),
      row('Dump of stolen credentials appears on forum', {}),
      row('Data exfiltrated from Canadian clinic, actor says', { country: 'CA', sector: 'Healthcare' }),
      row('Hacker leaks files from a regional ministry', { sector: 'Government' }),
      row('Hackers leak customer data of a regional bank', { sector: 'Finance' }),
      row('Post claims member records were exposed in a Lindt Japan e-commerce breach', { country: 'JP' }),
      row('Actor claims to have released an alleged database from Renaissance\'s website', {}),
      row('Post claims a threat actor released an alleged DEKRA database', {}),
    ],
    malware: [
      row('Botnet loader update released with new crypter', {}),
      row('Hacker recruits affiliates for new RAT', {}),
      row('Bulletproof hosting service relaunches', {}),
      row('VPS provider accepts crypto, no questions', {}),
    ],
    other: [
      row('Post shares a Skrillex live performance reference', { sector: '', country: '', records: '', actor: '' }),
      row('Forum admin announces maintenance window', { actor: '' }),
      row('Post claims Dread was temporarily disabled from the threat feed', {}),
      row('Report claims Electrum patched a Bitcoin fee-bump theft trick', { actor: '' }),
      row('Post claims AWS set a certificate deadline and is removing linked roots', {}),
    ],
  };

  for (const [category, rows] of Object.entries(CLAIMS)) {
    describe(`category ${category}`, () => {
      for (const { rec, want } of rows) {
        test(`${rec.headline}`, () => {
          const got = classifyClaim(rec);
          assert.equal(got.category, category, `category of "${rec.headline}"`);
          assert.equal(got.categoryLabel, CATEGORIES[category]);
          for (const [field, value] of Object.entries(want)) assert.equal(got[field], value, `${field} of "${rec.headline}"`);
        });
      }
    });
  }

  describe('category precedence', () => {
    test('ransomware beats every other signal', () => assert.equal(classifyClaim({ headline: 'Qilin lists victim; data also offered for sale' }).category, 'ransomware'));
    test('a record from the ransomware.live feed is ransomware even without keywords', () => assert.equal(classifyClaim({ kind: 'ransomware', headline: 'Listing for Acme' }).category, 'ransomware'));
    test('access for sale beats data for sale', () => assert.equal(classifyClaim({ headline: 'Selling shell access to a UK government server' }).category, 'access'));
    test('selling an access phrase without a sale word is not an access listing', () => assert.notEqual(classifyClaim({ headline: 'Initial access broker claims breach of Dutch port authority' }).category, 'access'));
    test('sale beats vulnerability', () => assert.equal(classifyClaim({ headline: 'New 0-day for sale' }).category, 'sale'));
    test('hacktivism beats leak', () => assert.equal(classifyClaim({ headline: 'Anonymous leaks data of a ministry' }).category, 'hacktivism'));
    test('vulnerability beats leak', () => assert.equal(classifyClaim({ headline: 'Researcher discloses flaw that exposed records' }).category, 'vuln'));
    test('leak beats malware', () => assert.equal(classifyClaim({ headline: 'Stealer logs leaked on forum' }).category, 'leak'));
  });

  describe('sector detection', () => {
    const SECTORS = [
      ['Healthcare', 'Ransomware group hits regional hospital'],
      ['Government', 'Hacker leaks files from a regional ministry'],
      ['Defence', 'Actor sells military documents'],
      ['Finance', 'Hackers leak customer data of a regional bank'],
      ['Education', 'Ransomware group hits Polish university'],
      ['Technology', 'Threat actor sells access to a SaaS provider'],
      ['Telecom', 'Qilin lists Spanish telecom operator'],
      ['Energy & utilities', 'Everest claims US energy utility'],
      ['Transport & logistics', 'LockBit hits logistics company in Italy'],
      ['Manufacturing', 'Akira hits German manufacturing plant'],
      ['Legal & professional', 'Medusa claims law firm in Canada'],
      ['Retail & consumer', 'Qilin lists Mexican retail chain'],
      ['Media', 'Rhysida targets national newspaper'],
    ];
    for (const [sector, headline] of SECTORS) test(`${sector}: ${headline}`, () => assert.equal(classifyClaim({ headline }).sector, sector));
    test('looks at the claim text as well as the headline', () => assert.equal(classifyClaim({ headline: 'Actor claims a breach', claim: 'The post alleges a regional hospital was breached.' }).sector, 'Healthcare'));
    test('is empty when nothing matches', () => assert.equal(classifyClaim({ headline: 'Qilin claims Acme Holdings' }).sector, ''));
  });

  describe('country detection', () => {
    // from country names and from adjectives
    const COUNTRY_PHRASES = [
      ['French', 'FR', 'France'], ['Canadian', 'CA', 'Canada'], ['Brazilian', 'BR', 'Brazil'], ['Israeli', 'IL', 'Israel'], ['Ukraine', 'UA', 'Ukraine'], ['Taiwanese', 'TW', 'Taiwan'],
      ['Indonesia', 'ID', 'Indonesia'], ['South African', 'ZA', 'South Africa'], ['Turkish', 'TR', 'Türkiye'], ['New Zealand', 'NZ', 'New Zealand'], ['British', 'GB', 'United Kingdom'],
      ['United Kingdom', 'GB', 'United Kingdom'], ['Scotland', 'GB', 'United Kingdom'], ['Saudi', 'SA', 'Saudi Arabia'], ['Dubai', 'AE', 'UAE'], ['Cambodia', 'KH', 'Cambodia'], ['Japanese', 'JP', 'Japan'],
      ['Polish', 'PL', 'Poland'], ['Dutch', 'NL', 'Netherlands'], ['Mexican', 'MX', 'Mexico'], ['Argentina', 'AR', 'Argentina'], ['Vietnamese', 'VN', 'Vietnam'], ['India', 'IN', 'India'],
      ['Philippines', 'PH', 'Philippines'], ['Egyptian', 'EG', 'Egypt'], ['Russian', 'RU', 'Russia'], ['Chinese', 'CN', 'China'], ['Iranian', 'IR', 'Iran'], ['Greek', 'GR', 'Greece'], ['Swiss', 'CH', 'Switzerland'],
      ['USA', 'US', 'United States'], ['American', 'US', 'United States'],
    ];
    for (const [phrase, iso, name] of COUNTRY_PHRASES) {
      test(`"${phrase}" is ${iso}`, () => {
        const got = classifyClaim({ headline: `Threat actor sells ${phrase} customer data` });
        assert.equal(got.country, iso);
        assert.equal(got.countryName, name);
      });
    }

    test('finds a possessive name (Brazil\'s)', () => assert.equal(classifyClaim({ headline: 'Qilin claims Brazil\'s Partido Liberal' }).country, 'BR'));
    test('finds a country in the claim text rather than the headline', () => assert.equal(classifyClaim({ headline: 'Actor claims a breach', claim: 'Germany-based automotive company ETO GRUPPE was named.' }).country, 'DE'));
    test('is empty when no country is mentioned', () => assert.deepEqual([classifyClaim({ headline: 'Qilin claims Acme Holdings' }).country, classifyClaim({ headline: 'Qilin claims Acme Holdings' }).countryName], ['', '']));
    test('an ISO country on the record wins over one found in the text', () => {
      const got = classifyClaim({ headline: 'Qilin claims French retailer', country: 'GB' });
      assert.equal(got.country, 'GB');
      assert.equal(got.countryName, 'United Kingdom');
    });
    test('a blank ISO country on the record falls back to the text', () => assert.equal(classifyClaim({ headline: 'Qilin claims French retailer', country: '' }).country, 'FR'));
    test('an ISO country on the record is kept even when it has no known name', () => assert.equal(classifyClaim({ headline: 'Qilin claims Ooredoo Myanmar', country: 'MM' }).country, 'MM'));
  });

  describe('records extraction', () => {
    const RECORDS = [
      ['a count in millions of accounts', 'Capcom ID hack leaked data on 11.7 million accounts', '11.7 million accounts'],
      ['a count in billions of records', 'Dump of 1.5 billion records leaked', '1.5 billion records'],
      ['a count in millions of patients', 'Dump of 2 million patients from a clinic', '2 million patients'],
      ['a compact count (300k users) with the unit upper-cased', 'Hacker leaks 300k users of a Dutch marketplace', '300K users'],
      ['a size with a space (48 GB)', 'Actor offers 48 GB of customer data from a Mexican bank', '48 GB'],
      ['a size without a space (48GB)', 'Actor offers 48GB of customer data', '48GB'],
      ['a size in terabytes (4.5TB)', 'Actor claims 4.5TB of ministry data', '4.5TB'],
      ['a size in megabytes', 'Seller shares a 750 MB sample of the database', '750 MB'],
      ['a record count over a byte size when both appear', 'Dump of 2 million users, 12 GB in total', '2 million users'],
    ];
    for (const [name, headline, want] of RECORDS) test(`extracts ${name}`, () => assert.equal(classifyClaim({ headline }).records, want));

    test('reads the claim text as well as the headline', () => {
      assert.equal(classifyClaim({ headline: 'Actor claims a breach', claim: 'The post says the dump holds 3 million customers.' }).records, '3 million customers');
    });
    test('does not mistake a currency code (500 GBP) for gigabytes', () => assert.equal(classifyClaim({ headline: 'Seller wants 500 GBP for the dump' }).records, ''));
    test('is empty when no size is given', () => assert.equal(classifyClaim({ headline: 'Qilin claims White & Case on its leak site' }).records, ''));
  });

  describe('actor extraction', () => {
    const ACTORS = [
      ['Qilin claims White & Case on its leak site', 'Qilin'],
      ['WhiteArmor claims Brazil\'s Partido Liberal on its leak site', 'WhiteArmor'],
      ['Post claims Qilin listed three victims on its dark web portal', 'Qilin'],
      ['BD Anonymous claims it targeted eType’s website', 'BD Anonymous'],
      ['NoName057(16) claims DDoS on Danish government sites', 'NoName057(16)'],
      ['Keymous claims outage of French banking portals', 'Keymous'],
      ['Kazu claims it stole 1.6M+ claim records from Rand Mutual', 'Kazu'],
      ['Hunters International claims German engineering firm', 'Hunters International'],
      ['Scattered Spider hit UK retailer', 'Scattered Spider'],
      ['LOCKBIT CLAIMS REGIONAL HOSPITAL', 'LockBit'],
    ];
    for (const [headline, want] of ACTORS) test(`"${headline}" -> ${want}`, () => assert.equal(classifyClaim({ headline }).actor, want));

    for (const lead of ['Post', 'Actor', 'Threat actor', 'Seller', 'Report', 'Researcher', 'User', 'Forum', 'Hacker', 'Group', 'Attacker', 'Unknown actor', 'Someone']) {
      test(`"${lead} claims ..." is a description, not an actor`, () => assert.equal(classifyClaim({ headline: `${lead} claims a regional clinic was breached` }).actor, ''));
    }

    test('the record\'s own group field wins over anything in the text', () => {
      assert.equal(classifyClaim({ headline: 'Listing claims HYFLOCK targeted Aesthetic Dental Designs, P.A', kind: 'ransomware', group: 'Hyflock' }).actor, 'Hyflock');
    });
    test('a known group is returned with its canonical spelling', () => assert.equal(classifyClaim({ headline: 'qilin claims a new victim' }).actor, 'Qilin'));
    test('is empty when the text names nobody', () => assert.equal(classifyClaim({ headline: 'Employee records exposed after misconfigured bucket' }).actor, ''));
  });

  describe('ransomware group list', () => {
    for (const group of RANSOM_GROUPS.filter((g) => !g.endsWith('.'))) {
      test(`recognises ${group}`, () => {
        const got = classifyClaim({ headline: `${group} claims a new victim` });
        assert.equal(got.category, 'ransomware');
        assert.equal(got.actor.toLowerCase(), group.toLowerCase());
      });
    }
  });

  describe('result shape and robustness', () => {
    test('always returns the seven documented fields, with a label that matches the category', () => {
      for (const rec of [{}, { headline: 'Qilin claims White & Case on its leak site' }, { headline: 'x', claim: 'y', kind: 'x' }, undefined]) {
        const got = classifyClaim(rec);
        for (const field of ['category', 'categoryLabel', 'sector', 'country', 'countryName', 'records', 'actor']) assert.equal(typeof got[field], 'string', field);
        assert.equal(got.categoryLabel, CATEGORIES[got.category]);
      }
    });
    test('an empty record is "other" with every other field empty', () => {
      const got = classifyClaim({});
      assert.equal(got.category, 'other');
      assert.equal(got.categoryLabel, 'Other claim');
      for (const field of ['sector', 'country', 'countryName', 'records', 'actor']) assert.equal(got[field], '', field);
      assert.deepEqual(classifyClaim(), got);
    });
    test('a missing headline or claim is treated as empty text', () => {
      assert.equal(classifyClaim({ claim: 'Qilin listed Acme Holdings on its leak site' }).category, 'ransomware');
      assert.equal(classifyClaim({ headline: 'Qilin claims Acme Holdings' }).category, 'ransomware');
    });
  });
});

// ===================================================================================== constants

describe('exported constants', () => {
  test('GROUP_LABEL names the six desks', () => {
    const want = { crisis: 'War room', darkweb: 'Dark web', cyber: 'Cyber', redteam: 'Red team', blueteam: 'Blue team', markets: 'Markets' };
    for (const [group, label] of Object.entries(want)) assert.equal(GROUP_LABEL[group], label, group);
  });
  test('KIND_LABEL names the four source kinds', () => {
    for (const kind of ['x', 'news', 'ransomware', 'forum']) assert.ok(KIND_LABEL[kind], kind);
  });
  test('CATEGORIES has the eight claim categories with human labels', () => {
    for (const category of ['ransomware', 'sale', 'access', 'leak', 'vuln', 'hacktivism', 'malware', 'other']) assert.ok(CATEGORIES[category] && CATEGORIES[category] === CATEGORIES[category].trim(), category);
  });
  test('RANSOM_GROUPS is a list of clean, non-empty names', () => {
    assert.ok(RANSOM_GROUPS.length >= 20);
    for (const g of RANSOM_GROUPS) assert.ok(typeof g === 'string' && g.trim() === g && g.length > 1, g);
  });
});

// ===================================================================================== robustness (seeded fuzz)

describe('robustness on random garbage', () => {
  // mulberry32: a tiny seeded PRNG so the "random" inputs are the same on every run
  const prng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const PIECES = ['BREAKING:', 'JUST IN:', 'WARNING -', '🚨', '🏴‍☠️', '🇺🇸', 'https://t.co/AbC123', '#infosec', '-RTS', '- AP', 'U.S.', 'Dr.', '3.5', 'NATO', 'CVE-2026-1234', 'Qilin', 'ransomware', 'claims', 'THE', 'a', 'of', 'Russia',
    'drone', 'strike', 'AT&amp;amp;T', '&amp;', '&#8217;', '&lt;b&gt;', '...', '.', '?', '!', ',', ';', '—', '•', '*', '$80,400', '435,000 users', '48 GB', 'Iran', 'Fed', 'Bitcoin', 'ünïcödé', '"quoted"', 'it\'s', 'x'.repeat(60), 'SHOUTING', 'LOUD', 'WORDS', 'HERE'];
  const make = (rand) => Array.from({ length: 1 + Math.floor(rand() * 40) }, () => PIECES[Math.floor(rand() * PIECES.length)]).join(rand() < 0.15 ? '' : ' ');
  const inputs = (() => { const rand = prng(20261025); return Array.from({ length: 400 }, () => make(rand)); })();

  test('cleanText returns tidy text with no links or pictographs', () => {
    for (const s of inputs) {
      const out = cleanText(s);
      assert.equal(typeof out, 'string');
      assert.ok(!/https?:\/\//.test(out), `link left in "${out}"`);
      assert.ok(!PICTOGRAPH.test(out), `pictograph left in "${out}"`);
      assert.equal(out, out.trim());
      assert.ok(!/\s{2,}/.test(out), `double space in "${out}"`);
    }
  });

  test('headlineOf never exceeds its limit', () => {
    for (const s of inputs) for (const max of [40, 80, 140]) assert.ok(headlineOf(s, max).length <= max, `"${s}" at ${max}`);
  });

  test('topicsOf returns at most two known labels for every group', () => {
    for (const s of inputs) for (const g of ['cyber', 'crisis', 'markets', 'darkweb', 'redteam', 'blueteam', 'bogus']) {
      const out = topicsOf(s, g);
      assert.ok(Array.isArray(out) && out.length <= 2);
      assert.equal(new Set(out).size, out.length);
    }
  });

  test('classifyClaim always returns a known category', () => {
    for (const s of inputs) {
      const got = classifyClaim({ headline: s, claim: s.slice(10) });
      assert.ok(got.category in CATEGORIES, got.category);
      assert.equal(typeof got.actor, 'string');
    }
  });

  test('normalizeBreaking and topNow cope with a random batch and stay newest-first', () => {
    const rand = prng(7);
    const groups = ['cyber', 'crisis', 'markets', 'darkweb', 'redteam', 'blueteam'];
    const items = Array.from({ length: 150 }, (_, i) => post({ id: `r${i}`, group: groups[Math.floor(rand() * groups.length)], kind: ['x', 'news', 'ransomware'][Math.floor(rand() * 3)], title: make(rand), published: ago(rand() * 60), severity: rand() < 0.2 ? 'high' : 'normal' }));
    const rows = normalizeBreaking(items, CFG);
    assert.ok(rows.length <= items.length);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].published >= rows[i].published, 'newest first');
    const top = topNow(rows, { now: NOW });
    assert.ok(top.length <= 6);
    for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].published >= top[i].published, 'topNow newest first');
  });
});

// ===================================================================================== regressions for fixed bugs

describe('regressions (bugs found by these tests and since fixed in feed.mjs)', () => {
  test('cleanText keeps a hyphenated compound that starts with an alert word (Flash-flood is not a "Flash" prefix)', () => {
    for (const s of ['Flash-flood warnings issued across northern Italy after record rainfall', 'New-generation ransomware targets hospital networks across the Midwest', 'Update-driven malware campaign abuses the auto updater to push stealers']) {
      assert.equal(cleanText(s), s);
    }
  });

  test('title-casing keeps the hyphen in CVE-2026-1234', () => {
    assert.equal(cleanText('SHOUTING ABOUT CVE-2026-1234 IN FORTINET GEAR AS ATTACKERS ABUSE IT'), 'Shouting About CVE-2026-1234 in Fortinet Gear as Attackers Abuse It');
  });

  test('title-casing keeps an acronym upper case inside a hyphenated token (US-IRAN, U.S.-SUPPORTED)', () => {
    assert.match(cleanText('BRENT CRUDE CLIMBS 1.8% AMID CONCERNS OVER US-IRAN PEACE TALKS AND HORMUZ SHIPPING DISRUPTIONS'), /\bUS-/);
    assert.match(cleanText('U.S. SECRETARY OF STATE SAYS THE SAFE RETURN OF MS. MACHADO IS THE RESULT OF THE U.S.-SUPPORTED RECONCILIATION TALKS'), /U\.S\.-/);
  });

  test('title-casing keeps a known acronym upper case when it carries a possessive (NATO’S, FBI’S)', () => {
    const out = cleanText('NATO’S CHIEF SAYS THE FBI’S DIRECTOR WILL TRAVEL TO KYIV THIS WEEK FOR TALKS');
    assert.ok(out.startsWith('NATO'), out);
    assert.ok(out.includes('FBI'), out);
  });

  test('title-casing keeps S&P upper case', () => {
    assert.match(cleanText('S&P 500 FALLS AS TREASURY YIELDS SURGE AND OIL PRICES CLIMB ON IRAN TENSIONS'), /^S&P 500 /);
  });

  test('decode does not throw on an out-of-range numeric entity, so one bad title cannot fail a whole batch', () => {
    assert.doesNotThrow(() => decode('&#9999999999;'));
    assert.doesNotThrow(() => cleanText('Qilin claims a victim &#99999999999; of ransomware'));
    assert.doesNotThrow(() => normalizeBreaking([post({ kind: 'news', title: 'Qilin claims a victim &#99999999999; of ransomware' })], CFG));
  });

  test('decode decodes once even when a numeric entity produces an ampersand (&#38;amp; stays &amp;)', () => {
    assert.equal(decode('&#38;amp;'), '&amp;');
    assert.equal(decode('&#x26;lt;script&#x26;gt;'), '&lt;script&gt;');
  });

  test('a trailing double-dash credit is removed completely ("-- AFP")', () => {
    assert.equal(cleanText('US and Iran resume talks in Doha -- AFP'), 'US and Iran resume talks in Doha');
  });

  test('"Zero-day" is not triggered by a number ending in 0 before "days" (10, 30, 90 days)', () => {
    for (const s of ['Ransomware group intends to publish the data within 10 days', 'CISA gives federal agencies 30 days to patch the flaw', 'Attackers had access to the network for 90 days before detection']) {
      assert.ok(!topicsOf(s).includes('Zero-day'), s);
    }
    assert.ok(topicsOf('A 0-day is being exploited').includes('Zero-day'));
    assert.ok(topicsOf('Researchers found three zero-days in the router').includes('Zero-day'));
  });

  test('Crypto is not triggered by "whether" or "together"', () => {
    assert.ok(!topicsOf('Traders weigh whether the Fed will cut rates this year', 'markets').includes('Crypto'));
    assert.deepEqual(topicsOf('Leaders will meet together on Friday', 'markets'), []);
    assert.deepEqual(topicsOf('Ether climbs as Bitcoin steadies', 'markets'), ['Crypto']);
  });
});

// ===================================================================================== known bugs (still open)

describe('known bugs in feed.mjs (marked todo: they run, show up in the output and do not fail the suite)', () => {
  describe('topicsOf and filters', () => {
    test('BUG: Malware matches "uploader" (loader without a word boundary)', KNOWN_BUG, () => {
      assert.ok(!topicsOf('Filings were free downloads on the Internet Archive; the uploader’s account bore the ex-chairman’s name').includes('Malware'));
    });

    test('BUG: Casualties matches "deadline" (dead without a word boundary)', KNOWN_BUG, () => {
      assert.ok(!topicsOf('Trump gives Iran a deadline of Friday to accept the deal; talks continue', 'crisis').includes('Casualties'));
    });

    test('BUG: Ransomware matches "Cyclops" (clop without a word boundary)', KNOWN_BUG, () => {
      assert.ok(!topicsOf('Sandworm’s Cyclops Blink botnet returns, targeting ASUS routers').includes('Ransomware'));
    });

    test('BUG: "breaches" (the verb) is not Data breach, so such X posts are dropped as chatter', KNOWN_BUG, () => {
      assert.ok(topicsOf('Scattered Spider breaches another retailer, stealing customer data').includes('Data breach'));
      assert.equal(norm({ group: 'cyber', kind: 'x', title: 'Scattered Spider breaches another retailer, stealing customer data' }).length, 1);
    });

    test('BUG: the promo filter misses "We\'re hiring" written with a straight apostrophe', KNOWN_BUG, () => {
      assert.equal(norm({ group: 'cyber', kind: 'x', title: 'We\'re hiring a malware reverse engineer to join our team in London' }).length, 0);
    });

    test('BUG: topicsOf with max 0 still returns one label (the cap is checked after pushing)', KNOWN_BUG, () => {
      assert.deepEqual(topicsOf('Zero-day exploited in the wild', 'cyber', 0), []);
    });

    test('BUG: topNow with n = 0 still returns one item (the cap is checked after pushing)', KNOWN_BUG, () => {
      const items = [{ id: 'a', group: 'cyber', published: ago(1), severity: 'normal', also: [] }];
      assert.deepEqual(topNow(items, { now: NOW, n: 0 }), []);
    });
  });

  describe('classifyClaim', () => {
    test('BUG: a plain count such as "435,000 users" is not extracted as records (a million/thousand/K unit is required)', KNOWN_BUG, () => {
      assert.equal(classifyClaim({ headline: 'Actor claims PopChill was breached and user data exposed', claim: 'The post alleges that PopChill was breached and data on 435,000 users was exposed.' }).records, '435,000 users');
      assert.equal(classifyClaim({ headline: 'Seller claims 1,200,000 records of a Spanish clinic' }).records, '1,200,000 records');
    });

    test('BUG: "U.S." and "U.K." are never detected as countries (the \\b after the final full stop cannot match)', KNOWN_BUG, () => {
      assert.equal(classifyClaim({ headline: 'Threat actor sells U.S. hospital data' }).country, 'US');
      assert.equal(classifyClaim({ headline: 'Threat actor sells U.K. retailer data' }).country, 'GB');
    });

    test('BUG: the bare abbreviation "UK" is not detected as the United Kingdom', KNOWN_BUG, () => {
      assert.equal(classifyClaim({ headline: 'Selling shell access to a UK government server' }).country, 'GB');
    });

    test('BUG: "North Korean" is attributed to South Korea', KNOWN_BUG, () => {
      assert.notEqual(classifyClaim({ headline: 'North Korean Lazarus group claims theft from crypto exchange' }).country, 'KR');
      assert.equal(classifyClaim({ headline: 'South Korean telecom data for sale' }).country, 'KR');
    });

    test('BUG: an access listing worded "advertises access" is filed as data for sale', KNOWN_BUG, () => {
      assert.equal(classifyClaim({ headline: 'Actor advertises access to three corporate and public-sector environments', claim: 'The post alleges that the threat actor Glitch NoOp is advertising access to three organizations in the U.S. and Australia.' }).category, 'access');
    });

    test('BUG: "access broker" is read as the Finance sector (the victim here is a manufacturer)', KNOWN_BUG, () => {
      assert.equal(classifyClaim({ headline: 'Access broker sells RDP access to a German manufacturer' }).sector, 'Manufacturing');
    });

    test('BUG: the common word "Play" (Google Play) is read as the Play ransomware group', KNOWN_BUG, () => {
      const got = classifyClaim({ headline: 'Post claims a threat actor is selling Google Play developer accounts' });
      assert.notEqual(got.category, 'ransomware');
      assert.equal(got.actor, '');
    });
  });
});
