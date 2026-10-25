# Data sources

Internal reference: what Outpost reads, keeps and owes each source. Terms were read on 25 October 2026 and can change, so re-read the linked page before relying on a quote. The `docs/` folder is public in the repository, so keep this file factual.

| Source | What we take | How often | Terms, and what they require of us | What we deliberately do not take | Where in the code |
| --- | --- | --- | --- | --- | --- |
| Outlet feeds, daily briefing (32 RSS and Atom feeds) | Headline, link, date, outlet name, first 320 characters of the snippet, lead image resized to 960 px wide | Every 2 hours; 36-hour window; newest 25 per feed | Each outlet's own feed and image terms; not reviewed one by one. We credit and link the outlet | Article text | `src/fetch.mjs` (`pullFeed`, `thumbnail`), `config/sources.json` |
| CISA KEV and NIST NVD | Newest 12 KEV rows; CVSS score per CVE from the NVD API, cached | Every 10 minutes; NVD only for new CVEs | US government data; terms not reviewed here | Nothing beyond those fields | `src/fetch.mjs` (`pullKev`) |
| X posts through twitterapi.io (50 accounts, listed below) | Public original posts (no replies or reposts): text cut at 240 characters, handle, id, time, link. For Dark web streams only: the first attached photo (images on X's own host), kept as a small 720 px copy under `public/img/dw/`, shown blurred until clicked, credited to the account and linked to the post. Setting: `darkwebImages` in `config/breaking.json` (`off`, `blur` default, `show`). Not reviewed: X's and each account's rules on re-hosting media; the owner accepted this risk. | Every 5 minutes; one search per stream; only new posts | twitterapi.io [terms](https://twitterapi.io/terms) (September 2025): "Ensure that your use of the Service does not violate the rights of third parties, including X/Twitter's terms of service." X's own terms and each account's terms not reviewed | Images, video, avatars, profile data, replies, reposts | `src/breaking.mjs` (`pullX`), `config/breaking.json` (`x`) |
| News feeds on Breaking (11 feeds, listed below) | Headline, link, time, outlet name; newest 15 per feed, last 6 hours; BBC World and Al Jazeera only when they match conflict or security words | Every 5 minutes | Each outlet's own feed terms; not reviewed. Outpost carries ads, so check BBC World and MarketWatch (Dow Jones) first | Article text, images | `src/breaking.mjs` (`pullNews`), `config/breaking.json` (`news`) |
| Forum thread listings (DarkForums, BreachForums: public pages, no login) | Thread title and link when the title has words such as database, leak, dump, breach, access, RCE or stealer; up to 15 per forum per run; shown as unverified, links carry `rel="noopener nofollow ugc"` | Every 5 minutes | No licence; terms not reviewed | Thread bodies, attachments, images, usernames, anything behind a login. An anti-bot page counts as a failed run; we never try to get past it | `src/breaking.mjs` (`pullForum`), `config/breaking.json` (`forums`) |
| RansomLook (public API, `/api/posts?days=7`, no key) | Group name, victim name (140 characters at most), time, link to the group's page on RansomLook. No country (the API gives none) | Every 2 hours; last 7 days; at most 1,500 | [About page](https://www.ransomlook.io/about): all content, including API responses and datasets, is licensed CC BY 4.0. "You are free to share and adapt the material for any purpose, even commercially, provided that appropriate credit is given." Credit shown on the Dark web page: "Listings: RansomLook (ransomlook.io), licensed CC BY 4.0", linked. It also says "Claims from operators are not independently verified against victim confirmations." No rate limit is stated on the pages read | Screenshots, post descriptions, leak-site content, victims' files. We never visit leak sites | `src/intel.mjs` (`parseRansomLook`, `updateIntel`), `data/ransomware.json` |
| Have I Been Pwned (`/api/v3/breaches`, no key) | Name, domain, dates, number of accounts, up to 8 data classes, verified flag, description shortened to about 240 characters, link to HIBP's page. Added in the last 45 days, at most 30; fabricated, spam-list, stealer-log, sensitive and retired entries excluded | At most every 6 hours (checked on each 2-hourly run) | [API terms](https://haveibeenpwned.com/API/v3): CC BY 4.0. "Clear and visible attribution with a link to haveibeenpwned.com should be present anywhere data from the service is used." User-agent header required (`OutpostDailyBot/1.0`); rate limited | Email addresses and account lists (not returned by this endpoint; we use no search API) | `src/intel.mjs` (`pickBreaches`, `updateIntel`), `data/breaches.json` |
| ransomware.live (website, RSS, API) | Nothing | Never | Excluded until written approval exists, see below | Everything | Not read anywhere; listed in `excludeSources` |
| darkwebinformer.com (website, feeds, X account) | Nothing | Never | Excluded until a written agreement exists, see below | Everything | Not read anywhere; its X handle was removed from `config/breaking.json` and is listed in `excludeSources` |

Processors, not sources: the OpenAI API receives story headlines and snippets (daily briefing) and the text of X posts and forum titles (Dark web claims, `src/darkweb.mjs`, at most 12 new items per run), and returns summaries and rewrites. twitterapi.io is only the route to X.

Retention on Breaking: up to 72 hours, with a cap per stream (war room 140, cyber 140, dark web 120, red team 60, blue team 60, markets 50; 600 overall) in `src/breaking.mjs`. The Dark web claims keep 14 days, at most 40 (`src/darkweb.mjs`).

## Excluded sources and the switch

`config/breaking.json` holds `"excludeSources": ["@DarkWebInformer", "ransomware.live"]`. Items whose source is on that list are dropped by the Breaking filter (`normalizeBreaking` in `src/lib/feed.mjs`, also used by `api/breaking.js`), by the Dark web write-up job (`src/darkweb.mjs`) and by the page build (`src/render.mjs`). Older stored items are hidden at once; `data/darkweb.json` loses them at its next run and `data/breaking.json` within 72 hours. This list is the switch for bringing a source back after a written agreement: remove its name, and restore its handle or feed in the collector, which no longer reads either source.

### ransomware.live

Excluded because its terms allow only non-commercial use and Outpost carries ads. The Toolbox page only links to its website.

- [Terms and Conditions](https://www.ransomware.live/t&c) (updated 19 August 2026), section 5.2: "Commercial use of the Data is strictly prohibited without prior written approval from the owner of Ransomware.live." Examples of commercial use include "Monetization of insights derived from the Data". Section 5.1: the data is "freely available for non-commercial use".
- Section 6: it must be "clearly named as the source, linking back to ransomware.live" on any page that shows the data; suggested credit "Source: Ransomware.live".
- Section 4: "our Data is cached for 30 minutes; polling more frequently than that interval brings no fresher results", and polling faster "may be considered a breach of this Fair Usage policy"; "Not publishing our RAW data in any way (API, file, or otherwise)".
- [Disclaimer](https://www.ransomware.live/disclaimer): the information "has not been verified"; it is "only an inventory of claims". "Any commercial use of all or part of the Site without the express permission of the Publisher is prohibited".
- Next step: [docs/ransomware-live-approval-request.md](ransomware-live-approval-request.md), sent through https://ransomware.live/contact.

### darkwebinformer.com

Excluded because its terms forbid what Outpost would do (automated collection, reproduction and use on an ad-supported site) without written permission, and they say licences are available on request. No data from its website, feeds or X account is used.

- [Terms of Service](https://darkwebinformer.com/terms-of-service/) (effective 2026/07/17), Section 09: "Unauthorized reproduction, redistribution, or commercial use of any content is strictly prohibited". Same section: "Partnerships or licensing agreements are available upon request by contacting Dark Web Informer directly."
- Section 10: "All content published by Dark Web Informer is intended for personal, non-commercial use only unless explicitly authorized." Commercial use includes "Using content in marketing materials, advertisements, or promotional campaigns"; the route is to "subscribe to an API plan (see Section 25) or contact Dark Web Informer directly".
- [Acceptable Use Policy](https://darkwebinformer.com/acceptable-use-policy/) (effective 2026/07/05), Section 06, lists as prohibited: "bots, scrapers, spiders, crawlers, automated scripts, headless browsers, or bulk collection tools without written authorization".
- Credit (Terms, Section 11, "Image & Media Attribution"): for example "Source: Dark Web Informer" or a direct link; "Attribution must not be hidden, obscured, cropped out, or removed."
- Next step: [docs/darkwebinformer-licence-request.md](darkwebinformer-licence-request.md).

## Terms not reviewed individually

Outpost has not reviewed the terms of the remaining X accounts, the news feeds or the forums one by one. Outpost shows an X post only as a tidied headline (Breaking) or as an AI rewrite framed as a neutral claim (Dark web), always with a link to the original post, and never copies images or video. If you rely on an account or feed commercially, review its terms first.

- **X accounts, 50 (`config/breaking.json`).** Cyber: IntCyberDigest, H4ckmanac, vxunderground, campuscodi, briankrebs, GossiTheDog, MalwareHunterTeam, ESETresearch, TheHackersNews, BleepinComputer, TheRecord_Media, CISACyber. Red team: harmj0y, _dirkjan, mrd0x, SpecterOps, HackingDave, bohops, 0xdf_, TheHackerNews. Blue team: cyb3rops, SwiftOnSecurity, TheDFIRReport, wdormann, MsftSecIntel, Mandiant, unit42_intel, TalosSecurity, CrowdStrike, RedCanary. Dark web: FalconFeedsio, DailyDarkWeb, ransomwarelive, SOCRadar. War room: sentdefender, OSINTdefender, Faytuks, WarMonitors, IntelCrab, BNONews, Conflicts, AuroraIntel, RALee85, BBCBreaking. Markets: DeItaone, FirstSquawk, LiveSquawk, unusual_whales, zerohedge, business.
- **News feeds on Breaking, 11.** CISA Advisories, BleepingComputer, The Hacker News, The Record, SecurityWeek, Krebs on Security, Dark Reading, The DFIR Report, BBC World, Al Jazeera, MarketWatch.

## Open items

1. **`ransomwarelive` on X.** `x.darkweb` still lists `ransomwarelive`, which looks like ransomware.live's own account. If it is, remove it or add `@ransomwarelive` to `excludeSources` until approval exists, so the approval request can say nothing is collected.
2. **Have I Been Pwned.** The Dark web page shows the credit, the licence link and a note that descriptions are shortened. Keep all three, since CC BY 4.0 asks for changes to be indicated. The same applies to the RansomLook credit line.
3. **Filters.** The email, key and password filter runs in `src/darkweb.mjs` only; the Dark web stream on Breaking shows tidied post text without it.
4. **Stopping a source.** Remove it from `config/breaking.json` or `config/sources.json`; add it to `excludeSources` so stored items disappear at once.
