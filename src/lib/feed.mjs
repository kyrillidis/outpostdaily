// Shared, pure helpers for the Breaking and Dark web pages. Used by the page build, the live API
// (api/breaking.js) and the tests, so all three always agree. No I/O in this file.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };
export const decode = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
  }
  return NAMED[e.toLowerCase()] ?? m;
}); // one pass, so '&#38;amp;' becomes '&amp;', never '&'

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu;
const LEAD = /^\s*(?:rt\s+@\w+:\s*)?(?:[*•▪►▶→]+\s*)?(?:(?:breaking(?:\s+news)?|just\s+in|developing|alert|warning|urgent|update|flash|exclusive|news|new)(?:\s*[:|!]+\s*|\s+[-–—]+\s+|\s*[–—]+\s*))+/i;
const ABBR = /(?:\b[A-Z]|\b(?:Mr|Mrs|Ms|Dr|St|No|vs|etc|Inc|Ltd|Corp|Gov|Gen|Sen|Rep|Lt|Col|Sgt|U\.S|U\.K))$/;

const ACRONYMS = new Set('NATO US USA UK EU UN UAE IDF IRGC CISA FBI CIA NSA GPS GNSS AI DHS DOJ DOD DOE OPEC ECB FED CPI GDP DDOS RCE CVE APT VPN DNS API SSH MFA TLS SSL HTTP HTTPS SQL XSS PHP NPM IOC IOCS TTP KEV CVSS SOC EDR XDR SIEM USB USD EUR GBP JPY CAD AUD BTC ETH ISIS ICBM UAV UAS GCC IMF WTO NASA DARPA PLA UNSC ASEAN BRICS G7 G20 IPO CEO CFO ETF SEC FTC LNG WTI NYSE DJIA RTS AP AFP BBC CNN CNBC PM MP'.split(' '));
const SMALL = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'and', 'or', 'but', 'as', 'is', 'are', 'with', 'from', 'into', 'over', 'amid', 'after', 'than', 'that', 'its', 'his', 'her', 'has', 'was', 'be']);
// shouting wire lines ("TRUMP SAYS...") become Title Case so proper nouns stay capitalised; known acronyms stay upper
function titleCase(s) {
  let first = true;
  const seg = (w, isFirst) => {
    const m = w.match(/^(.*?)(['’]s)?$/i), core = m[1], poss = (m[2] ?? '').toLowerCase();
    const bare = core.replace(/[.&+'’]/g, '').toUpperCase();
    if (/^s&p$/i.test(core)) return 'S&P' + poss;
    if (ACRONYMS.has(bare) || /^u\.?s\.?$/i.test(core) || /^u\.?k\.?$/i.test(core)) return core.toUpperCase() + poss;
    if (/\d/.test(core)) return core + poss;
    const lower = core.toLowerCase();
    if (!isFirst && SMALL.has(lower)) return lower + poss;
    return lower.charAt(0).toUpperCase() + lower.slice(1) + poss;
  };
  return s.replace(/[A-Za-z0-9][A-Za-z0-9'’.&+-]*/g, (w) => {
    const isFirst = first;
    first = false;
    return w.split('-').map((part, i) => seg(part, isFirst && i === 0)).join('-');
  });
}

// Tidies a raw post or headline: no links, emoji, alert prefixes or hashtag tails; shouting becomes sentence case.
export function cleanText(raw) {
  let s = decode(raw).replace(/https?:\/\/\S+/g, ' ').replace(EMOJI, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) s = s.replace(LEAD, '');
  s = s.replace(/(?:\s+#\w+)+\s*$/g, '').replace(/#(\w+)/g, '$1').replace(/^[\s:|\-–—]+/, '').trim();
  s = s.replace(/^[*•▪►▶→\s]+/, '').replace(/\s*[-–—]{1,2}\s?[A-Z]{2,5}$/, '').trim();
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length > 24 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.62) s = titleCase(s);
  else {
    const toks = s.split(' ');
    let cut = toks.findIndex((w) => /[a-z]/.test(w));
    while (cut > 1 && /^(A|AN|THE|I|IN|AT)$/.test(toks[cut - 1])) cut--; // the next sentence's first word is not part of the shout
    if (cut >= 5 && toks.slice(0, cut).every((w) => !/[a-z]/.test(w))) s = titleCase(toks.slice(0, cut).join(' ')) + ' ' + toks.slice(cut).join(' ');
  }
  return s;
}

function firstSentence(t, min = 40, max = 150) {
  const re = /[.!?](?=\s+["“‘(]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(t))) {
    const head = t.slice(0, m.index);
    if (ABBR.test(head)) continue;
    if (m.index + 1 >= min && m.index + 1 <= max) return t.slice(0, m.index + 1);
    if (m.index + 1 > max) break;
  }
  return null;
}

// One tidy line for the page: first sentence when it is a sensible length, else cut at a word with an ellipsis.
export function headlineOf(raw, max = 140) {
  const t = cleanText(raw);
  if (!t) return '';
  const first = firstSentence(t, 40, max);
  let h = first ?? (t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…');
  if (/[.]$/.test(h) && !/\.\.\.$/.test(h)) h = h.slice(0, -1);
  return h;
}

// ---------- topics (no AI): up to two short labels per item ----------
const TOPIC_RULES = {
  cyber: [
    ['Ransomware', /ransomware|\blockbit|\bakira\b|\bqilin\b|\bcl0p\b|\bclop\b|\bblackcat\b|\balphv\b|\brhysida\b|\bmedusa\b|\bbianlian\b|\bplay ransom|\bdragonforce\b|\bsafepay\b/i],
    ['Zero-day', /\bzero[- ]?day|(?<!\d)\b0[- ]?day/i],
    ['Exploited', /actively exploited|exploited in the wild|exploitation|\bKEV\b|mass exploitation/i],
    ['Vulnerability', /CVE-\d{4}-\d+|vulnerabilit|\bRCE\b|remote code execution|\bflaws?\b|patch(es|ed)?\b|privilege escalation/i],
    ['Data breach', /data breach|\bbreach(ed|es)?\b|data leak|leaked (data|records|accounts|database|credentials|emails)|exposed (data|records|accounts|database|credentials|passwords|customers)|stolen data|\brecords\b|database|exfiltrat|hack of/i],
    ['DDoS & outages', /ddos|denial[- ]of[- ]service|outage|disrupt/i],
    ['Malware', /malware|trojan|\bstealer|botnet|backdoor|\bloader\b|\bwiper|rootkit|spyware|\bRAT\b/i],
    ['Phishing', /phish|smish|vish|credential harvest|social engineering/i],
    ['Supply chain', /supply[- ]chain|\bnpm\b|pypi|dependency|package registry/i],
    ['AI', /\bAI\b|\bLLM\b|artificial intelligence|\bagent(s|ic)?\b|copilot|chatgpt/i],
    ['Nation-state', /nation[- ]state|\bAPT\d*\b|state[- ]sponsored|espionage|lazarus|sandworm|volt typhoon|salt typhoon/i],
  ],
  crisis: [
    ['Strikes', /air ?strikes?|missile|rocket|shelling|bombard|struck|strikes?\b/i],
    ['Drones', /drones?|\bUAVs?\b|\bUAS\b|loitering/i],
    ['Naval & shipping', /\bnavy\b|naval|warship|vessel|strait|shipping|tanker|submarine|carrier strike/i],
    ['Ceasefire & talks', /ceasefire|truce|peace talks|negotiat|summit|treaty|sanctions?/i],
    ['Nuclear', /nuclear|enrichment|reactor|warhead/i],
    ['Casualties', /\bkilled\b|\bdead\b|casualt|\binjured\b|\bwounded\b|death toll/i],
    ['Cyber', /cyber|hack|ransomware|malware|outage/i],
    ['Evacuation', /evacuat|refugees?|displaced/i],
  ],
  markets: [
    ['Oil & energy', /\boil\b|crude|brent|\bwti\b|opec|\bgas\b|\blng\b|energy/i],
    ['Rates & central banks', /\bfed\b|federal reserve|rates?\b|yields?\b|inflation|\bcpi\b|\becb\b|central bank|treasur/i],
    ['Crypto', /bitcoin|\bbtc\b|\bether(eum)?\b|crypto|stablecoin/i],
    ['Stocks', /stocks?\b|shares\b|s&p|nasdaq|\bdow\b|equities|futures/i],
    ['Trade & sanctions', /tariff|trade war|sanction|export controls?/i],
    ['Defence & cyber stocks', /defen[cs]e (stocks?|shares|contractor)|lockheed|raytheon|rtx\b|crowdstrike|palo alto|cyber(security)? stocks?/i],
  ],
};
TOPIC_RULES.redteam = TOPIC_RULES.blueteam = TOPIC_RULES.darkweb = TOPIC_RULES.cyber;

export function topicsOf(text, group = 'cyber', max = 2) {
  if (max <= 0) return [];
  const rules = TOPIC_RULES[group] ?? TOPIC_RULES.cyber, out = [];
  for (const [label, re] of rules) if (re.test(text) && out.push(label) >= max) break;
  return out;
}

// ---------- Breaking: filter, tidy, de-duplicate ----------
const PROMO = /\b(giveaway|discount|promo code|use code|join (our|the) (discord|telegram|newsletter)|subscribe|webinar|register now|link in bio|sponsored|now hiring|we['’]?\s?(a)?re hiring|podcast|episode \d+)\b/i;
// first-person opinion and chatter rarely carry an event verb, so war-room posts must name something that happened
const CRISIS_EVENT = /\b(strikes?|air ?strikes?|missiles?|rockets?|drones?|uavs?|shell(ed|ing)|explosions?|blasts?|killed|casualt\w*|injured|wounded|shot down|intercept\w*|ceasefire|truce|troops|invasion|offensive|attack(ed|s)?|hostages?|evacuat\w*|warships?|submarines?|frontline|sanctions?|nuclear|coup|blockade|mobili[sz]\w*|deployed|seized|detained|arrested|resign\w*|talks|summit|treaty)\b/i;
const MARKET_EVENT = /\b(oil|crude|brent|opec|gas|lng|fed|rates?|yields?|inflation|cpi|ecb|tariffs?|sanctions?|gold|bitcoin|btc|crypto|dollar|euro|defen[cs]e|cyber|outage|plunge[sd]?|surge[sd]?|soar(s|ed)?|tumble[sd]?|halt(ed|s)?|default|bank|recession|shutdown|trade|export|chip|semiconductor)\b/i;

export const GROUP_LABEL = { crisis: 'War room', darkweb: 'Dark web', cyber: 'Cyber', redteam: 'Red team', blueteam: 'Blue team', markets: 'Markets' };
export const KIND_LABEL = { x: 'X post', news: 'News', ransomware: 'Leak-site claim', forum: 'Forum claim' };

const STOP = new Set('the a an of to in on for and or at by with from as is are be new over after says say said has have was were will its that this into amid than not can could would more most about their his her they them your our'.split(' '));
const tokens = (t) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)));

// Filters noise, tidies text, merges the same story from several sources, newest first.
// Merging is by rarity-weighted word overlap: words found in many items ("ransomware", "alert", "dark web portal") count for
// almost nothing, so template posts about different victims stay separate, while two reports sharing a name or a figure merge.
export function normalizeBreaking(items, cfg = {}) {
  const crisisNews = new RegExp(cfg.crisisRelevant ?? '$^', 'i');
  const skip = new Set((cfg.excludeSources ?? []).map((x) => String(x).toLowerCase())); // sources we do not use (terms of service), see docs/DATA-SOURCES.md
  const rows = [];
  for (const it of [...(items ?? [])].filter((x) => x && typeof x === 'object').sort((a, b) => String(b.published).localeCompare(String(a.published)))) {
    if (!it.title || !it.group || skip.has(String(it.source ?? '').toLowerCase())) continue;
    const text = cleanText(it.title);
    if (text.length < 24 || PROMO.test(text)) continue;
    if (it.group === 'crisis' && !(it.kind === 'news' ? crisisNews.test(it.title) : CRISIS_EVENT.test(text))) continue;
    if (it.group === 'markets' && !MARKET_EVENT.test(text)) continue;
    const headline = headlineOf(it.title);
    const row = { ...it, headline, text, topics: topicsOf(text, it.group), also: [] };
    if (it.kind === 'x' && ['cyber', 'redteam', 'blueteam'].includes(it.group) && !row.topics.length && it.severity !== 'high') continue; // brand and event chatter
    row._tk = tokens(headline);
    rows.push(row);
  }
  const df = new Map();
  for (const r of rows) for (const w of r._tk) df.set(w, (df.get(w) ?? 0) + 1);
  const weight = (w) => Math.log(1 + rows.length / (df.get(w) ?? 1));
  const similar = (a, b) => {
    let inter = 0, uni = 0, rare = 0;
    for (const w of new Set([...a, ...b])) { const x = weight(w); uni += x; if (a.has(w) && b.has(w)) { inter += x; if ((df.get(w) ?? 0) <= 3) rare++; } }
    return rare >= 2 && inter / (uni || 1) >= 0.5;
  };
  const clusters = [];
  for (const row of rows) {
    const hit = row._tk.size >= 3 && clusters.find((c) => c.group === row.group && similar(c.tk, row._tk));
    if (hit) hit.members.push(row); else clusters.push({ group: row.group, tk: row._tk, members: [row] });
  }
  return clusters.map(({ members }) => {
    // the verified outlet leads when one covered the story; other sources are listed as corroboration
    const lead = members.find((m) => m.kind === 'news') ?? members[0];
    const { _tk, ...clean } = lead;
    return { ...clean, also: members.filter((m) => m !== lead).map((m) => ({ source: m.source, url: m.url, kind: m.kind })) };
  }).sort((a, b) => String(b.published).localeCompare(String(a.published)));
}

// "Top now": the strongest recent items across streams, with at most two per stream so no desk crowds the rest out.
export function topNow(items, { now = Date.now(), n = 6, hours = 24, perGroup = 2 } = {}) {
  const score = (i) => {
    const age = (now - Date.parse(i.published)) / 36e5;
    return (i.severity === 'high' ? 3 : 0) + Math.min(i.also?.length ?? 0, 3) + (i.verified ? 1 : 0) + Math.max(0, 1 - age / hours) * 2;
  };
  if (n <= 0) return [];
  const used = {}, out = [];
  for (const i of items.filter((x) => x.group !== 'markets' && x.group !== 'darkweb' && now - Date.parse(x.published) < hours * 36e5).sort((a, b) => score(b) - score(a))) {
    if ((used[i.group] = (used[i.group] ?? 0) + 1) > perGroup) continue;
    out.push(i);
    if (out.length >= n) break;
  }
  return out.sort((a, b) => String(b.published).localeCompare(String(a.published)));
}

// ---------- Dark web: classify a claim (no AI, so it is free, consistent and testable) ----------
export const RANSOM_GROUPS = ['Qilin', 'Akira', 'LockBit', 'Cl0p', 'Clop', 'BlackCat', 'ALPHV', 'Rhysida', 'Medusa', 'BianLian', 'SafePay', 'Everest', 'DragonForce', 'INC Ransom', 'Hunters International', 'RansomHub', 'Lynx', 'Sinobi', 'Cloak', 'Falcon', 'PANZER', 'WhiteArmor', 'Whitearmor', 'HYFLOCK', 'EMPERADOR', 'Beelzebub', 'Interlock', 'Black Basta', 'Scattered Spider', 'ShinyHunters', 'Warlock', 'Anubis', 'Nova', 'Gentlemen', 'Kraken', 'Chaos', 'Fog', 'Qilin.'];
const RANSOM_RX = new RegExp(`\\b(${RANSOM_GROUPS.filter((g) => !/[.]$/.test(g)).map((g) => g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
const HACKTIVIST = /\b(NoName(057\(16\))?|Anonymous|Dark Storm|Killnet|Anonymous Sudan|Cyber Army|Team \w+ ?\w*|Server Killers|Mr Hamza|RipperSec|Keymous|Sector 16|hacktivis\w*)\b/i;

export const CATEGORIES = {
  ransomware: 'Ransomware',
  sale: 'Data for sale',
  access: 'Access for sale',
  leak: 'Data leak',
  vuln: 'Vulnerability',
  hacktivism: 'Hacktivism',
  malware: 'Malware & services',
  other: 'Other claim',
};

const SECTORS = [
  ['Healthcare', /hospital|health|clinic|medical|pharma|dental|laborator|patient|biotech/i],
  ['Government', /government|ministry|police|municipal|council|public sector|prosecutor|parliament|county|federal|city of|embassy|armed forces/i],
  ['Defence', /defen[cs]e|military|army|navy|air force|intelligence/i],
  ['Finance', /\bbanks?\b|financ|insurance|payment|credit union|investment|\bbrokerage\b|\bstock broker|fintech|crypto exchange|wallet/i],
  ['Education', /school|universit|college|academy|institute|student|campus/i],
  ['Technology', /software|saas|cloud|\btech\b|technology|hosting|\bvpn\b|platform|cybersecurity|developer|\bit services?\b/i],
  ['Telecom', /telecom|\bisp\b|mobile operator|carrier|broadband|5g/i],
  ['Energy & utilities', /\benergy\b|\boil\b|\bgas\b|utility|utilities|power plant|electric|solar|nuclear/i],
  ['Transport & logistics', /logistic|transport|shipping|freight|airline|airport|trucking|railway|port authority|courier/i],
  ['Manufacturing', /manufactur|industrial|factory|engineering|steel|automotive|machinery|aerospace|agro/i],
  ['Legal & professional', /law firm|legal|attorney|\bllp\b|consult|accounting|auditor|& case|luxenberg/i],
  ['Retail & consumer', /retail|\bstores?\b|e-?commerce|marketplace|shop|customer|restaurant|\bfood\b|hotel|travel|tourism|consumer/i],
  ['Media', /\bmedia\b|newspaper|broadcast|publisher|magazine/i],
];

const COUNTRIES = [
  ['US', 'United States', /(?<![\w.])(?:united states|u\.s\.?|usa|american|america)(?![\w])/i], ['GB', 'United Kingdom', /(?<![\w.])(?:united kingdom|u\.k\.?|uk|britain|british|england|scotland|wales)(?![\w])/i],
  ['CA', 'Canada', /\b(canada|canadian)\b/i], ['AU', 'Australia', /\b(australia|australian)\b/i], ['NZ', 'New Zealand', /\bnew zealand\b/i],
  ['FR', 'France', /\b(france|french)\b/i], ['DE', 'Germany', /\b(germany|german)\b/i], ['IT', 'Italy', /\b(italy|italian)\b/i], ['ES', 'Spain', /\b(spain|spanish)\b/i],
  ['PT', 'Portugal', /\b(portugal|portuguese)\b/i], ['NL', 'Netherlands', /\b(netherlands|dutch)\b/i], ['BE', 'Belgium', /\b(belgium|belgian)\b/i], ['CH', 'Switzerland', /\b(switzerland|swiss)\b/i],
  ['AT', 'Austria', /\b(austria|austrian)\b/i], ['SE', 'Sweden', /\b(sweden|swedish)\b/i], ['NO', 'Norway', /\b(norway|norwegian)\b/i], ['DK', 'Denmark', /\b(denmark|danish)\b/i], ['FI', 'Finland', /\b(finland|finnish)\b/i],
  ['PL', 'Poland', /\b(poland|polish)\b/i], ['CZ', 'Czechia', /\b(czech|czechia)\b/i], ['GR', 'Greece', /\b(greece|greek)\b/i], ['TR', 'Türkiye', /\b(turkey|türkiye|turkish)\b/i],
  ['RU', 'Russia', /\b(russia|russian)\b/i], ['UA', 'Ukraine', /\b(ukraine|ukrainian)\b/i], ['IL', 'Israel', /\b(israel|israeli)\b/i], ['IR', 'Iran', /\b(iran|iranian)\b/i], ['SA', 'Saudi Arabia', /\b(saudi)\b/i],
  ['AE', 'UAE', /\b(uae|emirates|dubai|abu dhabi)\b/i], ['EG', 'Egypt', /\begypt(ian)?\b/i], ['IN', 'India', /\b(india|indian)\b/i], ['PK', 'Pakistan', /\b(pakistan|pakistani)\b/i], ['BD', 'Bangladesh', /\b(bangladesh|bangladeshi)\b/i],
  ['CN', 'China', /\b(china|chinese)\b/i], ['TW', 'Taiwan', /\b(taiwan|taiwanese)\b/i], ['JP', 'Japan', /\b(japan|japanese)\b/i], ['KP', 'North Korea', /\bnorth korea(n)?\b/i], ['KR', 'South Korea', /\b(south korea|korean)\b/i], ['SG', 'Singapore', /\bsingapore\b/i],
  ['MY', 'Malaysia', /\bmalaysia(n)?\b/i], ['ID', 'Indonesia', /\bindonesia(n)?\b/i], ['TH', 'Thailand', /\b(thailand|thai)\b/i], ['VN', 'Vietnam', /\bvietnam(ese)?\b/i], ['PH', 'Philippines', /\b(philippines|filipino)\b/i],
  ['KH', 'Cambodia', /\bcambodia(n)?\b/i], ['BR', 'Brazil', /\b(brazil|brazilian)\b/i], ['AR', 'Argentina', /\bargentin(a|ian)\b/i], ['MX', 'Mexico', /\b(mexico|mexican)\b/i], ['CO', 'Colombia', /\bcolombia(n)?\b/i],
  ['CL', 'Chile', /\bchile(an)?\b/i], ['PE', 'Peru', /\bperu(vian)?\b/i], ['VE', 'Venezuela', /\bvenezuela(n)?\b/i], ['ZA', 'South Africa', /\bsouth africa(n)?\b/i], ['NG', 'Nigeria', /\bnigeria(n)?\b/i], ['KE', 'Kenya', /\bkenya(n)?\b/i],
  ['MA', 'Morocco', /\bmorocc(o|an)\b/i], ['LB', 'Lebanon', /\blebanon|lebanese\b/i], ['JO', 'Jordan', /\bjordan(ian)?\b/i], ['IE', 'Ireland', /\b(ireland|irish)\b/i], ['RO', 'Romania', /\bromania(n)?\b/i], ['HU', 'Hungary', /\bhungar(y|ian)\b/i],
];

const SIZE = /(\d{1,3}(?:,\d{3})+\s+(?:records|rows|users|customers|accounts|people|patients|entries|emails|documents|files|citizens|employees|students|members)|\d[\d,.]*\s?(?:million|billion|thousand|[MKB])\+?\s+(?:records|rows|users|customers|accounts|people|patients|entries|emails|documents|files|citizens|employees|students|members))/i;
const BYTES = /(\d[\d,.]*\s?(?:GB|TB|MB))\b/i;
const NOT_ACTOR = /^(post|actor|threat actor|seller|report|researcher|user|forum|hacker|group|attacker|unknown|someone|a |the )/i;

export function classifyClaim(rec = {}) {
  const text = `${rec.headline ?? ''} ${rec.claim ?? ''}`;
  const head = rec.headline ?? '';
  let category = 'other';
  if (rec.kind === 'ransomware' || /ransomware|leak[- ]?site|extortion/i.test(text) || (RANSOM_RX.test(head) && /list|claim|publish|victim|hit|affected|target/i.test(head))) category = 'ransomware';
  else if (/\b(initial access|rdp|vpn access|network access|shell access|admin access|access to (?:\w+ ){0,4}(?:networks?|environments?|organi[sz]ations?|compan(?:y|ies)|systems?|servers?|corporate))\b/i.test(text) && /sell|sale|offer|auction|advertis/i.test(text)) category = 'access';
  else if (/\b(sell|sells|selling|sale|for sale|offers?|offered|auction|advertis)/i.test(text)) category = 'sale';
  else if (HACKTIVIST.test(head) || /\b(ddos|defac|hacktivis|targeted .*websites?)\b/i.test(text)) category = 'hacktivism';
  else if (/\b(vulnerab|exploit|cve-\d|zero-day|0-day|\brce\b|flaws?\b|proof[- ]of[- ]concept|\bpoc\b)/i.test(text)) category = 'vuln';
  else if (/\b(breach|leak|exposed|dump|database|records|compromis|stolen|exfiltrat)/i.test(text)) category = 'leak';
  else if (/\b(malware|loader|stealer|botnet|\brat\b|crypter|vps|hosting|marketplace|service|rewrite|recruit)/i.test(text)) category = 'malware';

  const sector = (SECTORS.find(([, re]) => re.test(text)) ?? [])[0] ?? '';
  const iso = rec.country || (COUNTRIES.find(([, , re]) => re.test(text)) ?? [])[0] || '';
  const countryName = (COUNTRIES.find(([c]) => c === iso) ?? [])[1] ?? '';
  const size = (text.match(SIZE) ?? [])[1] ?? '';
  const bytes = (text.match(BYTES) ?? [])[1] ?? '';
  const records = (size || bytes).replace(/\s+/g, ' ').replace(/^(\d[\d,.]*)(M|K|B)\b/i, (_, n, u) => `${n}${u.toUpperCase()}`);
  let actor = rec.group ?? '';
  if (!actor) {
    const g = text.match(RANSOM_RX)?.[1];
    if (g) actor = RANSOM_GROUPS.find((x) => x.toLowerCase() === g.toLowerCase()) ?? g;
    else {
      const m = head.match(/^([A-Z][\w.()-]*(?: [A-Z][\w.()-]*){0,2}) (?:claims?|alleges?|says|lists?|offers?|advertises)\b/);
      if (m && !NOT_ACTOR.test(m[1] + ' ')) actor = m[1];
    }
  }
  return { category, categoryLabel: CATEGORIES[category], sector, country: iso, countryName, records, actor };
}
